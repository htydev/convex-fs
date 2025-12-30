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

// =============================================================================
// Storage Configuration Types
// =============================================================================

/**
 * S3-compatible storage configuration.
 */
export interface S3StorageConfig {
  type: "s3";
  /** AWS access key ID or equivalent for S3-compatible services */
  accessKeyId: string;
  /** AWS secret access key or equivalent for S3-compatible services */
  secretAccessKey: string;
  /** Base URL including bucket path */
  endpoint: string;
  /** AWS region. Defaults to "auto" */
  region?: string;
}

/**
 * Bunny.net Edge Storage configuration.
 */
export interface BunnyStorageConfig {
  type: "bunny";
  /** Bunny.net Edge Storage API key */
  apiKey: string;
  /** Name of the storage zone */
  storageZoneName: string;
  /** Region for the storage zone endpoint */
  region?: string;
  /** CDN hostname for downloads, e.g., "myzone.b-cdn.net" or custom domain */
  cdnHostname: string;
  /** Token authentication key for signed CDN URLs */
  tokenKey?: string;
}

/**
 * Storage configuration - discriminated union of S3 and Bunny.
 */
export type StorageConfig = S3StorageConfig | BunnyStorageConfig;

// =============================================================================
// ConvexFS Options
// =============================================================================

/**
 * Options for ConvexFS constructor.
 */
export interface ConvexFSOptions {
  /** Storage backend configuration */
  storage: StorageConfig;

  /** Upload URL TTL in seconds. Defaults to 3600 (1 hour) */
  uploadUrlTtl?: number;

  /** Download URL TTL in seconds. Defaults to 3600 (1 hour) */
  downloadUrlTtl?: number;

  /** Grace period (in seconds) before orphaned blobs are deleted. Defaults to 86400 (24 hours) */
  blobGracePeriod?: number;
}

/**
 * Configuration for registerRoutes().
 */
export interface RegisterRoutesConfig {
  /** Path prefix for blob routes. Defaults to "/blobs" */
  pathPrefix?: string;

  /** Auth callback - return true to allow access, false to deny */
  auth?: AuthCallback;
}

export type { HttpRouter };
