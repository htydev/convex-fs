/**
 * Internal validators and types for ops module.
 * These are shared between transact.ts and basics.ts but not exported publicly.
 */
import { v } from "convex/values";

/**
 * Internal validator for a single file in the commit.
 * basis: undefined = overwrite, null = must not exist, string = must match
 */
export const fileCommitValidator = v.object({
  path: v.string(),
  blobId: v.string(),
  basis: v.optional(v.union(v.null(), v.string())),
});
