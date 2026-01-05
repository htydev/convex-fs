import type { BlobStore, BunnyBlobStoreConfig, TestBlobStoreConfig } from "./types.js";
export type { BlobStore, BunnyBlobStoreConfig, TestBlobStoreConfig, UploadUrlOptions, DownloadUrlOptions, PutOptions, DeleteResult, } from "./types.js";
export { MAX_FILE_SIZE_BYTES } from "./types.js";
export { createBunnyBlobStore } from "./bunny.js";
export { createTestBlobStore } from "./test.js";
/**
 * Storage configuration type.
 * Supports Bunny.net Edge Storage and in-memory test storage.
 */
export type StorageConfig = ({
    type: "bunny";
} & BunnyBlobStoreConfig) | ({
    type: "test";
} & TestBlobStoreConfig);
/**
 * Factory function that creates the appropriate BlobStore based on config type.
 */
export declare function createBlobStore(config: StorageConfig): BlobStore;
//# sourceMappingURL=index.d.ts.map