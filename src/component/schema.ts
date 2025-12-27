import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Pending uploads awaiting commit
  uploads: defineTable({
    // UUID for the blob in object storage
    blobId: v.string(),
    // Unix timestamp (ms) when the presigned upload URL expires
    expiresAt: v.number(),
  })
    .index("blobId", ["blobId"])
    .index("expiresAt", ["expiresAt"]), // For GC queries

  // Committed blobs with reference counting
  blobs: defineTable({
    blobId: v.string(),
    metadata: v.object({
      contentType: v.string(),
      size: v.number(),
    }),
    refCount: v.number(),
    updatedAt: v.number(), // Unix timestamp (ms) of last refCount change
  })
    .index("blobId", ["blobId"])
    .index("refCountUpdatedAt", ["refCount", "updatedAt"]), // For BGC queries

  // File paths pointing to blobs
  files: defineTable({
    blobId: v.string(),
    path: v.string(),
  }).index("path", ["path"]),

  // Cached presigned download URLs
  blobDownloadUrls: defineTable({
    blobId: v.string(),
    url: v.string(),
    expiresAt: v.number(),
  })
    .index("blobId", ["blobId"])
    .index("expiresAt", ["expiresAt"]), // For DGC queries

  // Stored config for background jobs (components can't access env vars)
  config: defineTable({
    key: v.string(),
    value: v.object({
      accessKeyId: v.string(),
      secretAccessKey: v.string(),
      endpoint: v.string(),
      region: v.optional(v.string()),
      uploadUrlTtl: v.optional(v.number()),
      downloadUrlTtl: v.optional(v.number()),
      blobGracePeriod: v.optional(v.number()), // Seconds before orphaned blobs are deleted
    }),
  }).index("key", ["key"]),
});
