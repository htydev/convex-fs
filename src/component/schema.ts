import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import type { b } from "vitest/dist/chunks/suite.d.FvehnV49.js";

export default defineSchema({
  uploads: defineTable({
    // UUID
    blobId: v.string(),
    // Unix timestamp (ms) when the presigned upload URL expires
    expiresAt: v.number(),
  }).index("blobId", ["blobId"]),
  blobs: defineTable({
    blobId: v.string(),
    metadata: v.object({
      contentType: v.string(),
      size: v.number(),
    }),
    refCount: v.number(),
    updatedAt: v.number(), // Unix timestamp (ms) of last refCount change
  }).index("blobId", ["blobId"]),
  files: defineTable({
    blobId: v.string(),
    path: v.string(),
  }).index("path", ["path"]),
  blobDownloadUrls: defineTable({
    blobId: v.string(),
    url: v.string(),
    expiresAt: v.number(),
  }).index("blobId", ["blobId"]),
});
