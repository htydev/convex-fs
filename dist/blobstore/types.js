/**
 * Configuration for the in-memory test blob store.
 *
 * NOT for production use - blobs are stored in-memory and don't persist
 * across Convex function invocations. This is only useful in convex-test
 * where everything runs in a single process.
 */
/** Maximum file size in bytes (15MB). */
export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
//# sourceMappingURL=types.js.map