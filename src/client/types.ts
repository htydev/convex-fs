import type {
  HttpRouter,
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
  GenericDataModel,
} from "convex/server";

/**
 * Minimal query context type for running component queries.
 */
export type QueryCtx = Pick<GenericQueryCtx<GenericDataModel>, "runQuery">;

/**
 * Minimal mutation context type for running component queries and mutations.
 */
export type MutationCtx = Pick<
  GenericMutationCtx<GenericDataModel>,
  "runQuery" | "runMutation"
>;

/**
 * Minimal action context type for running component queries, mutations, and actions.
 */
export type ActionCtx = Pick<
  GenericActionCtx<GenericDataModel>,
  "runQuery" | "runMutation" | "runAction"
>;

/**
 * HTTP action context with auth support.
 */
export type HttpActionCtx = GenericActionCtx<GenericDataModel>;

/**
 * Auth callback for HTTP routes.
 * Return true to allow access, false to deny.
 */
export type AuthCallback = (
  ctx: HttpActionCtx,
  blobId: string,
) => Promise<boolean>;

/**
 * Configuration for registerRoutes().
 */
export interface RegisterRoutesConfig {
  /** Path prefix for blob routes. Defaults to "/blobs" */
  pathPrefix?: string;

  /** Auth callback - return true to allow access, false to deny */
  auth?: AuthCallback;

  /** Override FS_ACCESS_KEY_ID env var */
  FS_ACCESS_KEY_ID?: string;

  /** Override FS_SECRET_ACCESS_KEY env var */
  FS_SECRET_ACCESS_KEY?: string;

  /** Override FS_ENDPOINT env var */
  FS_ENDPOINT?: string;

  /** Override FS_REGION env var */
  FS_REGION?: string;

  /** Download URL TTL in seconds. Defaults to 3600 (1 hour) */
  downloadUrlTtl?: number;
}

/**
 * Options for ConvexFS constructor.
 */
export interface ConvexFSOptions {
  /** Override FS_ACCESS_KEY_ID env var */
  FS_ACCESS_KEY_ID?: string;

  /** Override FS_SECRET_ACCESS_KEY env var */
  FS_SECRET_ACCESS_KEY?: string;

  /** Override FS_ENDPOINT env var */
  FS_ENDPOINT?: string;

  /** Override FS_REGION env var */
  FS_REGION?: string;

  /** Upload URL TTL in seconds. Defaults to 3600 (1 hour) */
  uploadUrlTtl?: number;

  /** Download URL TTL in seconds. Defaults to 3600 (1 hour) */
  downloadUrlTtl?: number;

  /** Grace period (in seconds) before orphaned blobs are deleted. Defaults to 86400 (24 hours) */
  blobGracePeriod?: number;
}

export type { HttpRouter };
