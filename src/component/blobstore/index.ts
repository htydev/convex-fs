export type {
  BlobStore,
  S3BlobStoreConfig,
  BunnyBlobStoreConfig,
  BlobMetadata,
  UploadUrlOptions,
  DownloadUrlOptions,
  PutOptions,
  DeleteResult,
} from "./types.js";

export { createS3BlobStore } from "./s3.js";
export { createBunnyBlobStore } from "./bunny.js";

import type {
  BlobStore,
  S3BlobStoreConfig,
  BunnyBlobStoreConfig,
} from "./types.js";
import { createS3BlobStore } from "./s3.js";
import { createBunnyBlobStore } from "./bunny.js";

/**
 * Discriminated union type for storage configuration.
 * Use `type: "s3"` for S3-compatible storage or `type: "bunny"` for Bunny.net.
 */
export type StorageConfig =
  | ({ type: "s3" } & S3BlobStoreConfig)
  | ({ type: "bunny" } & BunnyBlobStoreConfig);

/**
 * Factory function that creates the appropriate BlobStore based on config type.
 */
export function createBlobStore(config: StorageConfig): BlobStore {
  switch (config.type) {
    case "s3":
      return createS3BlobStore({
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        endpoint: config.endpoint,
        region: config.region,
      });
    case "bunny":
      return createBunnyBlobStore({
        apiKey: config.apiKey,
        storageZoneName: config.storageZoneName,
        region: config.region,
        cdnHostname: config.cdnHostname,
        tokenKey: config.tokenKey,
      });
    default:
      throw new Error(
        `Unknown storage type: ${(config as { type: string }).type}`,
      );
  }
}
