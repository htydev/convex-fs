/**
 * Background jobs for the blob store component.
 *
 * - UGC: GC for expired/abandoned uploads (runs at :00)
 * - BGC: GC for orphaned blobs with refCount=0 (runs at :20)
 * - Cleanup for expired download URL cache entries (runs at :40, to be implemented)
 */

import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import { createBlobStore } from "./blobstore/index.js";

// =============================================================================
// Constants
// =============================================================================

/** Grace period after URL expiry before upload cleanup (1 hour) */
const UPLOAD_GRACE_PERIOD_MS = 60 * 60 * 1000;

/** Default grace period before orphaned blobs are deleted (24 hours in seconds) */
const DEFAULT_BLOB_GRACE_PERIOD_S = 24 * 60 * 60;

/** Max items to process per GC run */
const GC_BATCH_SIZE = 100;

// =============================================================================
// UGC: Upload Garbage Collection
// =============================================================================

/**
 * Find expired upload records.
 *
 * Returns uploads where expiresAt < threshold, up to the specified limit.
 */
export const findExpiredUploads = internalQuery({
  args: {
    threshold: v.number(),
    limit: v.number(),
  },
  returns: v.array(
    v.object({
      _id: v.id("uploads"),
      blobId: v.string(),
      expiresAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const uploads = await ctx.db
      .query("uploads")
      .withIndex("expiresAt", (q) => q.lt("expiresAt", args.threshold))
      .take(args.limit);

    return uploads.map((u) => ({
      _id: u._id,
      blobId: u.blobId,
      expiresAt: u.expiresAt,
    }));
  },
});

/**
 * Delete upload records by ID.
 */
export const deleteUploadRecords = internalMutation({
  args: { ids: v.array(v.id("uploads")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const id of args.ids) {
      await ctx.db.delete(id);
    }
    return null;
  },
});

/**
 * GC expired uploads.
 *
 * Finds uploads where the presigned URL has expired (plus grace period),
 * deletes the blobs from S3, and removes the upload records.
 *
 * Only self-schedules if batch was full AND no S3 errors occurred
 * (to avoid hammering S3 during outages).
 */
export const gcExpiredUploads = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    // 1. Get stored config
    const configDoc = await ctx.runQuery(internal.config.getConfig, {
      key: "storage",
    });

    if (!configDoc) {
      // No config stored yet - component hasn't been used
      return null;
    }

    const config = configDoc.value;

    // Check if GC is frozen (emergency stop)
    if (config.freezeGc) {
      console.log("[UGC] GC is frozen (freezeGc=true), skipping cleanup");
      return null;
    }

    // 2. Find expired uploads (URL expired + grace period)
    const threshold = Date.now() - UPLOAD_GRACE_PERIOD_MS;
    const expired = await ctx.runQuery(internal.background.findExpiredUploads, {
      threshold,
      limit: GC_BATCH_SIZE,
    });

    if (expired.length === 0) {
      console.log("[UGC] No expired uploads to clean up");
      return null;
    }

    console.log(`[UGC] Found ${expired.length} expired uploads to clean up`);

    // 3. Delete blobs from storage in parallel, tracking results
    const store = createBlobStore(config.storage);

    const results = await Promise.all(
      expired.map(async (upload) => {
        try {
          const result = await store.delete(upload.blobId);
          if (result.status === "not_found") {
            console.log(
              `[UGC] Blob ${upload.blobId} never made it to S3 (upload abandoned)`,
            );
          }
          return { status: result.status, upload };
        } catch (error) {
          console.log(
            `[UGC] Failed to delete blob ${upload.blobId} from S3: ${error}`,
          );
          return { status: "error" as const, upload };
        }
      }),
    );

    // Categorize results
    const okToDelete = results
      .filter((r) => r.status !== "error")
      .map((r) => r.upload);
    const deletedCount = results.filter((r) => r.status === "deleted").length;
    const notFoundCount = results.filter(
      (r) => r.status === "not_found",
    ).length;
    const errorCount = results.filter((r) => r.status === "error").length;

    console.log(
      `[UGC] Deleted ${deletedCount} from S3, ${notFoundCount} never made it to S3, ${errorCount} S3 errors`,
    );

    // 4. Delete upload records only for successful S3 deletes (or not_found)
    if (okToDelete.length > 0) {
      await ctx.runMutation(internal.background.deleteUploadRecords, {
        ids: okToDelete.map((u) => u._id),
      });
      console.log(
        `[UGC] Removed ${okToDelete.length} upload records from database`,
      );
    }

    // 5. Only self-schedule if batch was full AND no S3 errors
    //    (to avoid hammering S3 during outages)
    if (expired.length === GC_BATCH_SIZE && errorCount === 0) {
      console.log("[UGC] Batch full, scheduling follow-up run");
      await ctx.scheduler.runAfter(0, internal.background.gcExpiredUploads, {});
    }

    return null;
  },
});

// =============================================================================
// BGC: Blob Garbage Collection (orphaned blobs with refCount=0)
// =============================================================================

/**
 * Find orphaned blobs (refCount=0, updatedAt older than threshold).
 */
export const findOrphanedBlobs = internalQuery({
  args: {
    threshold: v.number(),
    limit: v.number(),
  },
  returns: v.array(
    v.object({
      _id: v.id("blobs"),
      blobId: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const blobs = await ctx.db
      .query("blobs")
      .withIndex("refCountUpdatedAt", (q) =>
        q.eq("refCount", 0).lt("updatedAt", args.threshold),
      )
      .take(args.limit);

    return blobs.map((b) => ({
      _id: b._id,
      blobId: b.blobId,
    }));
  },
});

/**
 * Delete blob records by ID.
 */
export const deleteBlobRecords = internalMutation({
  args: { ids: v.array(v.id("blobs")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const id of args.ids) {
      await ctx.db.delete(id);
    }
    return null;
  },
});

/**
 * GC orphaned blobs.
 *
 * Finds blobs with refCount=0 that have been orphaned for longer than
 * the grace period, deletes them from S3, and removes the blob records.
 *
 * Only self-schedules if batch was full AND no S3 errors occurred
 * (to avoid hammering S3 during outages).
 */
export const gcOrphanedBlobs = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    // 1. Get stored config
    const configDoc = await ctx.runQuery(internal.config.getConfig, {
      key: "storage",
    });

    if (!configDoc) {
      // No config stored yet - component hasn't been used
      return null;
    }

    const config = configDoc.value;

    // Check if GC is frozen (emergency stop)
    if (config.freezeGc) {
      console.log("[BGC] GC is frozen (freezeGc=true), skipping cleanup");
      return null;
    }

    // 2. Calculate threshold using configured grace period
    const gracePeriodS = config.blobGracePeriod ?? DEFAULT_BLOB_GRACE_PERIOD_S;
    const threshold = Date.now() - gracePeriodS * 1000;

    // 3. Find orphaned blobs
    const orphaned = await ctx.runQuery(internal.background.findOrphanedBlobs, {
      threshold,
      limit: GC_BATCH_SIZE,
    });

    if (orphaned.length === 0) {
      console.log("[BGC] No orphaned blobs to clean up");
      return null;
    }

    console.log(`[BGC] Found ${orphaned.length} orphaned blobs to clean up`);

    // 4. Delete blobs from storage in parallel, tracking results
    const store = createBlobStore(config.storage);

    const results = await Promise.all(
      orphaned.map(async (blob) => {
        try {
          const result = await store.delete(blob.blobId);
          if (result.status === "not_found") {
            // Blob already gone from S3 - still clean up DB record
            console.log(`[BGC] Blob ${blob.blobId} already deleted from S3`);
          }
          return { status: result.status, blob };
        } catch (error) {
          console.log(
            `[BGC] Failed to delete blob ${blob.blobId} from S3: ${error}`,
          );
          return { status: "error" as const, blob };
        }
      }),
    );

    // Categorize results
    const okToDelete = results
      .filter((r) => r.status !== "error")
      .map((r) => r.blob);
    const deletedCount = results.filter((r) => r.status === "deleted").length;
    const notFoundCount = results.filter(
      (r) => r.status === "not_found",
    ).length;
    const errorCount = results.filter((r) => r.status === "error").length;

    console.log(
      `[BGC] Deleted ${deletedCount} from S3, ${notFoundCount} already gone, ${errorCount} S3 errors`,
    );

    // 5. Delete blob records only for successful S3 deletes (or not_found)
    if (okToDelete.length > 0) {
      await ctx.runMutation(internal.background.deleteBlobRecords, {
        ids: okToDelete.map((b) => b._id),
      });
      console.log(
        `[BGC] Removed ${okToDelete.length} blob records from database`,
      );
    }

    // 6. Only self-schedule if batch was full AND no S3 errors
    //    (to avoid hammering S3 during outages)
    if (orphaned.length === GC_BATCH_SIZE && errorCount === 0) {
      console.log("[BGC] Batch full, scheduling follow-up run");
      await ctx.scheduler.runAfter(0, internal.background.gcOrphanedBlobs, {});
    }

    return null;
  },
});

// =============================================================================
// DGC: Download URL Cache Garbage Collection
// =============================================================================

/**
 * GC expired download URL cache entries.
 *
 * Cleans up cached presigned download URLs that have expired.
 * This is purely a DB cleanup - no S3 interaction needed.
 *
 * Self-schedules if batch was full to run to completion.
 */
export const gcExpiredDownloadUrls = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    // Check if GC is frozen (emergency stop)
    const configDoc = await ctx.db
      .query("config")
      .withIndex("key", (q) => q.eq("key", "storage"))
      .unique();

    if (configDoc?.value.freezeGc) {
      console.log("[DGC] GC is frozen (freezeGc=true), skipping cleanup");
      return null;
    }

    const now = Date.now();

    // Find expired download URL cache entries
    const expired = await ctx.db
      .query("blobDownloadUrls")
      .withIndex("expiresAt", (q) => q.lt("expiresAt", now))
      .take(GC_BATCH_SIZE);

    if (expired.length === 0) {
      console.log("[DGC] No expired download URLs to clean up");
      return null;
    }

    console.log(
      `[DGC] Found ${expired.length} expired download URLs to clean up`,
    );

    // Delete the expired records
    for (const record of expired) {
      await ctx.db.delete(record._id);
    }

    console.log(`[DGC] Removed ${expired.length} expired download URL records`);

    // Self-schedule if batch was full
    if (expired.length === GC_BATCH_SIZE) {
      console.log("[DGC] Batch full, scheduling follow-up run");
      await ctx.scheduler.runAfter(
        0,
        internal.background.gcExpiredDownloadUrls,
        {},
      );
    }

    return null;
  },
});
