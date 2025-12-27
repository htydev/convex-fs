/**
 * Config storage for background jobs.
 *
 * Components can't access env vars, so we store config in the database
 * when it's first provided via client operations.
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server.js";
import { configValidator } from "./validators.js";

// Validator matching the config table schema
const storedConfigValidator = v.object({
  accessKeyId: v.string(),
  secretAccessKey: v.string(),
  endpoint: v.string(),
  region: v.optional(v.string()),
  uploadUrlTtl: v.optional(v.number()),
  downloadUrlTtl: v.optional(v.number()),
  blobGracePeriod: v.optional(v.number()),
});

/**
 * Get stored config by key.
 */
export const getConfig = internalQuery({
  args: { key: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      key: v.string(),
      value: storedConfigValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("config")
      .withIndex("key", (q) => q.eq("key", args.key))
      .unique();

    if (!doc) return null;
    return { key: doc.key, value: doc.value };
  },
});

/**
 * Store config if not already stored.
 * Called by prepareUpload to ensure config is available for GC.
 */
export const ensureConfigStored = internalMutation({
  args: { config: configValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("config")
      .withIndex("key", (q) => q.eq("key", "s3"))
      .unique();

    if (!existing) {
      await ctx.db.insert("config", {
        key: "s3",
        value: {
          accessKeyId: args.config.accessKeyId,
          secretAccessKey: args.config.secretAccessKey,
          endpoint: args.config.endpoint,
          region: args.config.region,
          uploadUrlTtl: args.config.uploadUrlTtl,
          downloadUrlTtl: args.config.downloadUrlTtl,
          blobGracePeriod: args.config.blobGracePeriod,
        },
      });
    }

    return null;
  },
});
