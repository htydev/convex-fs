import { MAX_FILE_SIZE_BYTES } from "./types.js";
/**
 * In-memory BlobStore for testing.
 *
 * NOT for production use - blobs are stored in-memory and don't persist
 * across Convex function invocations. This is only useful in convex-test
 * where everything runs in a single process.
 */
export function createTestBlobStore() {
    const blobs = new Map();
    return {
        _blobs: blobs,
        async generateUploadUrl() {
            throw new Error("Test store does not support presigned upload URLs. Use put() directly.");
        },
        async generateDownloadUrl(key) {
            return `test://${key}`;
        },
        async put(key, data, opts) {
            // Check file size limit
            const size = data instanceof Blob ? data.size : data.byteLength;
            if (size > MAX_FILE_SIZE_BYTES) {
                throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB.`);
            }
            const bytes = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data;
            blobs.set(key, {
                data: bytes,
                contentType: opts?.contentType ?? "application/octet-stream",
            });
        },
        async get(key) {
            const stored = blobs.get(key);
            if (!stored)
                return null;
            return new Blob([stored.data.buffer], {
                type: stored.contentType,
            });
        },
        async delete(key) {
            if (blobs.has(key)) {
                blobs.delete(key);
                return { status: "deleted" };
            }
            return { status: "not_found" };
        },
    };
}
//# sourceMappingURL=test.js.map