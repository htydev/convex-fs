/**
 * Basic filesystem operations for ConvexFS.
 *
 * This module contains the fundamental file operations:
 * - stat: Get file metadata
 * - list: List files with pagination
 * - copyByPath, moveByPath, deleteByPath: Convenience wrappers
 * - getBlob, getFile: Download blob/file data
 * - writeFile: Write data directly to a file
 * - restore, clearAllFiles: Internal utilities
 */
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  action,
  internalAction,
  internalMutation,
  mutation,
  query,
} from "../_generated/server.js";
import { api, internal } from "../_generated/api.js";

import { configValidator, fileMetadataValidator } from "../types.js";
import { paginator } from "convex-helpers/server/pagination";
import schema from "../schema.js";
import { createBlobStore } from "../blobstore/index.js";

export const stat = query({
  args: {
    config: configValidator,
    path: v.string(),
  },
  returns: v.union(v.null(), fileMetadataValidator),
  handler: async (ctx, args) => {
    const file = await ctx.db
      .query("files")
      .withIndex("path", (q) => q.eq("path", args.path))
      .unique();

    if (!file) {
      return null;
    }

    const blob = await ctx.db
      .query("blobs")
      .withIndex("blobId", (q) => q.eq("blobId", file.blobId))
      .unique();

    if (!blob) {
      throw new Error(
        `Invariant violation: blob not found for blobId "${file.blobId}" (path: "${args.path}")`,
      );
    }

    return {
      path: file.path,
      blobId: file.blobId,
      contentType: blob.metadata.contentType,
      size: blob.metadata.size,
      attributes: file.attributes,
    };
  },
});

/**
 * List files in the filesystem with pagination.
 *
 * Returns files sorted alphabetically by path, with optional prefix filtering
 * and cursor-based pagination.
 *
 * This query is compatible with `usePaginatedQuery` from `convex-fs/react`.
 *
 * @example
 * ```typescript
 * // Server-side iteration
 * const result = await ctx.runQuery(api.lib.list, {
 *   config,
 *   prefix: "/uploads/",
 *   paginationOpts: { numItems: 50, cursor: null },
 * });
 *
 * // React with usePaginatedQuery
 * import { usePaginatedQuery } from "convex-fs/react";
 *
 * const { results, status, loadMore } = usePaginatedQuery(
 *   api.files.list,
 *   { prefix: "/uploads/" },
 *   { initialNumItems: 20 },
 * );
 * ```
 */
export const list = query({
  args: {
    config: configValidator,
    prefix: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(fileMetadataValidator),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { numItems, cursor, endCursor } = args.paginationOpts;
    const prefix = args.prefix ?? "";

    // Build query with paginator for cursor-based pagination
    const paginatedQuery = paginator(ctx.db, schema)
      .query("files")
      .withIndex("path", (q) => {
        if (prefix) {
          // Match paths starting with prefix using range query
          return q.gte("path", prefix).lt("path", prefix + "\uffff");
        }
        return q;
      })
      .order("asc");

    const result = await paginatedQuery.paginate({
      cursor: cursor,
      numItems: numItems,
      endCursor: endCursor ?? undefined,
    });

    // Join with blobs table to get metadata for each file
    const page = await Promise.all(
      result.page.map(async (file) => {
        const blob = await ctx.db
          .query("blobs")
          .withIndex("blobId", (q) => q.eq("blobId", file.blobId))
          .unique();

        if (!blob) {
          throw new Error(
            `Invariant violation: blob not found for blobId "${file.blobId}" (path: "${file.path}")`,
          );
        }

        return {
          path: file.path,
          blobId: file.blobId,
          contentType: blob.metadata.contentType,
          size: blob.metadata.size,
          attributes: file.attributes,
        };
      }),
    );

    return {
      page,
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

/**
 * Copy a file to a new path.
 *
 * This is a convenience wrapper around `transact` for the common case of
 * copying a file to a path that doesn't exist.
 *
 * @throws If source file doesn't exist
 * @throws If destination already exists
 */
export const copyByPath = mutation({
  args: {
    config: configValidator,
    sourcePath: v.string(),
    destPath: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const source = await ctx.runQuery(api.ops.basics.stat, {
      config: args.config,
      path: args.sourcePath,
    });
    if (!source) {
      throw new Error(`Source file not found: "${args.sourcePath}"`);
    }

    await ctx.runMutation(api.ops.transact.transact, {
      config: args.config,
      ops: [{ op: "copy", source, dest: { path: args.destPath, basis: null } }],
    });
    return null;
  },
});

/**
 * Move a file to a new path.
 *
 * This is a convenience wrapper around `transact` for the common case of
 * moving a file to a path that doesn't exist.
 *
 * @throws If source file doesn't exist
 * @throws If destination already exists
 */
export const moveByPath = mutation({
  args: {
    config: configValidator,
    sourcePath: v.string(),
    destPath: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const source = await ctx.runQuery(api.ops.basics.stat, {
      config: args.config,
      path: args.sourcePath,
    });
    if (!source) {
      throw new Error(`Source file not found: "${args.sourcePath}"`);
    }

    await ctx.runMutation(api.ops.transact.transact, {
      config: args.config,
      ops: [{ op: "move", source, dest: { path: args.destPath, basis: null } }],
    });
    return null;
  },
});

/**
 * Delete a file by path.
 *
 * This is a convenience wrapper around `transact` for the common case of
 * deleting a file. This operation is idempotent - if the file doesn't exist,
 * it's a no-op.
 */
export const deleteByPath = mutation({
  args: {
    config: configValidator,
    path: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const source = await ctx.runQuery(api.ops.basics.stat, {
      config: args.config,
      path: args.path,
    });
    if (!source) {
      // Idempotent: no-op if file doesn't exist
      return null;
    }

    await ctx.runMutation(api.ops.transact.transact, {
      config: args.config,
      ops: [{ op: "delete", source }],
    });
    return null;
  },
});

// ============================================================================
// Blob/File Download
// ============================================================================

/**
 * Get a blob's raw data by blobId.
 *
 * This downloads the blob from storage and returns it as an ArrayBuffer.
 * Returns null if the blob doesn't exist.
 *
 * @example
 * const data = await ctx.runAction(api.ops.basics.getBlob, {
 *   config,
 *   blobId: "abc123",
 * });
 * if (data) {
 *   // Process the ArrayBuffer...
 * }
 */
export const getBlob = action({
  args: {
    config: configValidator,
    blobId: v.string(),
  },
  returns: v.union(v.null(), v.bytes()),
  handler: async (_ctx, args) => {
    const { config, blobId } = args;

    const store = createBlobStore(config.storage);
    const blob = await store.get(blobId);

    if (!blob) {
      return null;
    }

    return await blob.arrayBuffer();
  },
});

/**
 * Get a file's contents and metadata by path.
 *
 * This looks up the file by path, downloads the blob from storage,
 * and returns both the data and metadata.
 * Returns null if the file doesn't exist.
 *
 * @example
 * const result = await ctx.runAction(api.ops.basics.getFile, {
 *   config,
 *   path: "/images/photo.jpg",
 * });
 * if (result) {
 *   console.log(result.contentType); // "image/jpeg"
 *   console.log(result.size); // 12345
 *   // result.data is an ArrayBuffer
 * }
 */
export const getFile = action({
  args: {
    config: configValidator,
    path: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      data: v.bytes(),
      contentType: v.string(),
      size: v.number(),
    }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<{
    data: ArrayBuffer;
    contentType: string;
    size: number;
  } | null> => {
    const { config, path } = args;

    // Look up file by path to get blobId and metadata
    const file: {
      path: string;
      blobId: string;
      contentType: string;
      size: number;
    } | null = await ctx.runQuery(api.ops.basics.stat, { config, path });
    if (!file) {
      return null;
    }

    // Get blob from storage
    const store = createBlobStore(config.storage);
    const blob = await store.get(file.blobId);
    if (!blob) {
      // File record exists but blob is missing from storage
      // This shouldn't happen in normal operation
      return null;
    }

    return {
      data: await blob.arrayBuffer(),
      contentType: file.contentType,
      size: file.size,
    };
  },
});

/**
 * Write data directly to a file path.
 *
 * This is a convenience wrapper that uploads the blob to storage and
 * commits it to the given path in one call. Overwrites if the file
 * already exists.
 *
 * @example
 * // Process an image and save the result
 * const result = await ctx.runAction(api.ops.basics.getFile, { config, path: "/input.jpg" });
 * const processed = await processImage(result.data); // your processing logic
 * await ctx.runAction(api.ops.basics.writeFile, {
 *   config,
 *   path: "/output.webp",
 *   data: processed,
 *   contentType: "image/webp",
 * });
 */
export const writeFile = action({
  args: {
    config: configValidator,
    path: v.string(),
    data: v.bytes(),
    contentType: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { config, path, data, contentType } = args;

    // Upload blob to storage
    const { blobId } = await ctx.runAction(api.transfer.uploadBlob, {
      config,
      data,
      contentType,
    });

    // Commit to path (overwrites if exists)
    await ctx.runMutation(api.ops.transact.commitFiles, {
      config,
      files: [{ path, blobId }],
    });

    return null;
  },
});

// ============================================================================
// Internal Dev Utilities
// ============================================================================

/**
 * Restore a file by re-linking an existing blob to a path.
 *
 * This is an admin utility for recovering accidentally deleted files.
 * It increments the blob's refCount and creates a new file record.
 *
 * NOTE: There's a small race condition if the blob is being GC'd at the
 * exact moment of restore. In practice this is unlikely since GC runs
 * periodically and has a grace period.
 *
 * @throws If blob doesn't exist (may have been garbage collected)
 */
export const restore = internalMutation({
  args: {
    blobId: v.string(),
    path: v.string(),
  },
  returns: fileMetadataValidator,
  handler: async (ctx, args) => {
    // 1. Look up blob
    const blob = await ctx.db
      .query("blobs")
      .withIndex("blobId", (q) => q.eq("blobId", args.blobId))
      .unique();

    if (!blob) {
      throw new Error(
        `Blob not found: "${args.blobId}". It may have been garbage collected.`,
      );
    }

    // 2. Increment refCount
    const now = Date.now();
    await ctx.db.patch(blob._id, {
      refCount: blob.refCount + 1,
      updatedAt: now,
    });

    // 3. Insert file record
    await ctx.db.insert("files", {
      path: args.path,
      blobId: args.blobId,
    });

    // 4. Return metadata
    return {
      path: args.path,
      blobId: args.blobId,
      contentType: blob.metadata.contentType,
      size: blob.metadata.size,
    };
  },
});

/**
 * Delete all files from the filesystem.
 *
 * This is an internal dev utility that deletes files in batches of 100,
 * rescheduling itself until all files are gone. Orphaned blobs will be
 * cleaned up by the background garbage collector.
 *
 * Reads config from the config table (key: "storage").
 */
export const clearAllFiles = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // Read config from config table
    const configDoc = await ctx.runQuery(internal.config.getConfig, {
      key: "storage",
    });
    if (!configDoc) {
      throw new Error(
        'No config found in config table with key "storage". ' +
          "Upload a file first to initialize the config.",
      );
    }
    const config = configDoc.value;

    // Safety check: require explicit opt-in via dashboard
    if (!config.allowClearAllFiles) {
      throw new Error(
        "clearAllFiles is disabled. To enable it, set allowClearAllFiles: true " +
          'in the config table (key: "storage") via the Convex dashboard. ' +
          "This is a safety measure to prevent accidental data loss in production.",
      );
    }

    // Strip dashboard-only fields before passing to public APIs
    const clientConfig = {
      storage: config.storage,
      downloadUrlTtl: config.downloadUrlTtl,
      blobGracePeriod: config.blobGracePeriod,
    };

    // Get a page of files
    const result = await ctx.runQuery(api.ops.basics.list, {
      config: clientConfig,
      paginationOpts: { numItems: 100, cursor: null },
    });

    if (result.page.length === 0) {
      // Done - no more files
      console.log("clearAllFiles: No more files to delete");
      return null;
    }

    console.log(`clearAllFiles: Deleting ${result.page.length} files`);

    // Delete all files in this page
    await ctx.runMutation(api.ops.transact.transact, {
      config: clientConfig,
      ops: result.page.map((file) => ({
        op: "delete" as const,
        source: file,
      })),
    });

    // If we got a full page, there might be more - reschedule
    if (result.page.length === 100) {
      await ctx.scheduler.runAfter(0, internal.ops.basics.clearAllFiles, {});
    }

    return null;
  },
});
