import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import { createBlobStore } from "./blobstore/index.js";
import { configValidator } from "./validators.js";

const DEFAULT_URL_TTL = 3600; // 1 hour
const MAX_UPLOAD_SIZE = 16 * 1024 * 1024; // 16MB

export const createUpload = internalMutation({
  args: {
    blobId: v.string(),
    expiresAt: v.number(),
    // Optional metadata for proxy uploads (Bunny flow)
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
  },
  returns: v.id("uploads"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("uploads", {
      blobId: args.blobId,
      expiresAt: args.expiresAt,
      contentType: args.contentType,
      size: args.size,
    });
  },
});

export const prepareUpload = action({
  args: {
    config: configValidator,
  },
  returns: v.object({
    url: v.string(),
    blobId: v.string(),
  }),
  handler: async (ctx, args) => {
    const { config } = args;

    // Store config for background GC (components can't access env vars)
    await ctx.runMutation(internal.config.ensureConfigStored, { config });

    const ttl = config.uploadUrlTtl ?? DEFAULT_URL_TTL;
    const expiresAt = Date.now() + ttl * 1000;

    // For Bunny storage, return empty blobId - client will POST to upload proxy
    // and receive blobId in response
    if (config.storage.type === "bunny") {
      return { url: "", blobId: "" };
    }

    // For S3, generate presigned URL
    const blobId = crypto.randomUUID();

    // Record the pending upload in the database
    await ctx.runMutation(internal.transfer.createUpload, {
      blobId,
      expiresAt,
    });

    // Generate presigned URL
    const store = createBlobStore(config.storage);
    const url = await store.generateUploadUrl(blobId, {
      expiresIn: ttl,
    });

    return { url, blobId };
  },
});

/**
 * Upload a blob to storage via server-side proxy.
 * Used for Bunny.net which doesn't support presigned upload URLs.
 * Called from HTTP action handler.
 */
export const uploadBlob = action({
  args: {
    config: configValidator,
    data: v.bytes(),
    contentType: v.string(),
  },
  returns: v.object({
    blobId: v.string(),
  }),
  handler: async (ctx, args) => {
    const { config, data, contentType } = args;

    // Validate size
    if (data.byteLength > MAX_UPLOAD_SIZE) {
      throw new Error(
        `File too large: ${data.byteLength} bytes (max ${MAX_UPLOAD_SIZE} bytes)`,
      );
    }

    // Store config for background GC (components can't access env vars)
    await ctx.runMutation(internal.config.ensureConfigStored, { config });

    // Generate blobId
    const blobId = crypto.randomUUID();

    // Create blob store and upload
    const store = createBlobStore(config.storage);
    await store.put(blobId, new Uint8Array(data), { contentType });

    // Record the pending upload with metadata (we know size/contentType since we proxied)
    const ttl = config.uploadUrlTtl ?? DEFAULT_URL_TTL;
    const expiresAt = Date.now() + ttl * 1000;
    await ctx.runMutation(internal.transfer.createUpload, {
      blobId,
      expiresAt,
      contentType,
      size: data.byteLength,
    });

    return { blobId };
  },
});

// Internal query to get upload records by blobIds (for cached metadata)
export const getUploadsByBlobIds = internalQuery({
  args: {
    blobIds: v.array(v.string()),
  },
  returns: v.array(
    v.union(
      v.null(),
      v.object({
        blobId: v.string(),
        contentType: v.optional(v.string()),
        size: v.optional(v.number()),
      }),
    ),
  ),
  handler: async (ctx, args) => {
    return await Promise.all(
      args.blobIds.map(async (blobId) => {
        const upload = await ctx.db
          .query("uploads")
          .withIndex("blobId", (q) => q.eq("blobId", blobId))
          .unique();
        if (!upload) return null;
        return {
          blobId: upload.blobId,
          contentType: upload.contentType,
          size: upload.size,
        };
      }),
    );
  },
});

// Internal query to get cached download URL
export const getCachedDownloadUrl = internalQuery({
  args: {
    blobId: v.string(),
  },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const cached = await ctx.db
      .query("blobDownloadUrls")
      .withIndex("blobId", (q) => q.eq("blobId", args.blobId))
      .unique();

    if (!cached) {
      return null;
    }

    // Check if URL is still valid (with some buffer time)
    const bufferMs = 60 * 1000; // 1 minute buffer
    if (cached.expiresAt <= Date.now() + bufferMs) {
      return null;
    }

    return cached.url;
  },
});

// Internal mutation to cache download URL
export const cacheDownloadUrl = internalMutation({
  args: {
    blobId: v.string(),
    url: v.string(),
    expiresAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Delete any existing cached URL for this blob
    const existing = await ctx.db
      .query("blobDownloadUrls")
      .withIndex("blobId", (q) => q.eq("blobId", args.blobId))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }

    // Insert new cached URL
    await ctx.db.insert("blobDownloadUrls", {
      blobId: args.blobId,
      url: args.url,
      expiresAt: args.expiresAt,
    });

    return null;
  },
});

export const getDownloadUrl = action({
  args: {
    config: configValidator,
    blobId: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const { config, blobId } = args;

    // For Bunny storage, CDN URLs don't expire, so we can skip caching
    if (config.storage.type === "bunny") {
      const store = createBlobStore(config.storage);
      return store.generateDownloadUrl(blobId);
    }

    // For S3, check cache for valid URL
    const cachedUrl: string | null = await ctx.runQuery(
      internal.transfer.getCachedDownloadUrl,
      { blobId },
    );

    if (cachedUrl) {
      return cachedUrl;
    }

    // Generate new presigned URL from S3
    const store = createBlobStore(config.storage);

    const ttl = config.downloadUrlTtl ?? DEFAULT_URL_TTL;
    const url = await store.generateDownloadUrl(blobId, {
      expiresIn: ttl,
    });

    // Cache the URL
    const expiresAt = Date.now() + ttl * 1000;
    await ctx.runMutation(internal.transfer.cacheDownloadUrl, {
      blobId,
      url,
      expiresAt,
    });

    return url;
  },
});
