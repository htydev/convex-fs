/**
 * Config storage for background jobs.
 *
 * Components can't access env vars, so we store config in the database
 * when it's first provided via client operations.
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server.js";
import { configValidator, storageConfigValidator } from "./validators.js";

// Validator matching the config table schema
const storedConfigValidator = v.object({
  storage: storageConfigValidator,
  uploadUrlTtl: v.optional(v.number()),
  downloadUrlTtl: v.optional(v.number()),
  blobGracePeriod: v.optional(v.number()),
  freezeGc: v.optional(v.boolean()),
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
 * Store or update config.
 * Called by prepareUpload to ensure config is available for GC.
 *
 * Updates all client-provided config values, but preserves the dashboard-only
 * `freezeGc` field (which can only be set manually via the Convex dashboard).
 */
export const ensureConfigStored = internalMutation({
  args: { config: configValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Use "storage" as the key for config (was "s3" before, now generic)
    const existing = await ctx.db
      .query("config")
      .withIndex("key", (q) => q.eq("key", "storage"))
      .unique();

    const newValue = {
      storage: args.config.storage,
      uploadUrlTtl: args.config.uploadUrlTtl,
      downloadUrlTtl: args.config.downloadUrlTtl,
      blobGracePeriod: args.config.blobGracePeriod,
      // freezeGc is dashboard-only - preserve existing value
      freezeGc: existing?.value.freezeGc,
    };

    if (!existing) {
      await ctx.db.insert("config", {
        key: "storage",
        value: newValue,
      });
    } else {
      await ctx.db.patch(existing._id, {
        value: newValue,
      });
    }

    return null;
  },
});
