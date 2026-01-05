export declare const createUpload: import("convex/server").RegisteredMutation<"internal", {
    contentType?: string | undefined;
    size?: number | undefined;
    blobId: string;
    expiresAt: number;
}, Promise<import("convex/values").GenericId<"uploads">>>;
/**
 * Register a pending upload that was uploaded directly to storage.
 * Called by client after direct-to-storage upload (data plane in caller's context).
 */
export declare const registerPendingUpload: import("convex/server").RegisteredMutation<"public", {
    config: {
        downloadUrlTtl?: number | undefined;
        blobGracePeriod?: number | undefined;
        storage: {
            region?: string | undefined;
            tokenKey?: string | undefined;
            apiKey: string;
            storageZoneName: string;
            cdnHostname: string;
            type: "bunny";
        } | {
            type: "test";
        };
    };
    blobId: string;
    contentType: string;
    size: number;
}, Promise<null>>;
/**
 * Upload a blob to storage via server-side proxy.
 * Called from HTTP action handler.
 */
export declare const uploadBlob: import("convex/server").RegisteredAction<"public", {
    config: {
        downloadUrlTtl?: number | undefined;
        blobGracePeriod?: number | undefined;
        storage: {
            region?: string | undefined;
            tokenKey?: string | undefined;
            apiKey: string;
            storageZoneName: string;
            cdnHostname: string;
            type: "bunny";
        } | {
            type: "test";
        };
    };
    contentType: string;
    data: ArrayBuffer;
}, Promise<{
    blobId: `${string}-${string}-${string}-${string}-${string}`;
}>>;
export declare const getUploadsByBlobIds: import("convex/server").RegisteredQuery<"internal", {
    blobIds: string[];
}, Promise<({
    blobId: string;
    contentType: string | undefined;
    size: number | undefined;
} | null)[]>>;
/**
 * Get a download URL for a blob.
 * For Bunny storage, this generates a signed CDN URL.
 *
 * @param blobId - The blob identifier
 * @param ttl - Optional TTL in seconds (overrides config.downloadUrlTtl)
 */
export declare const getDownloadUrl: import("convex/server").RegisteredAction<"public", {
    extraParams?: Record<string, string> | undefined;
    ttl?: number | undefined;
    config: {
        downloadUrlTtl?: number | undefined;
        blobGracePeriod?: number | undefined;
        storage: {
            region?: string | undefined;
            tokenKey?: string | undefined;
            apiKey: string;
            storageZoneName: string;
            cdnHostname: string;
            type: "bunny";
        } | {
            type: "test";
        };
    };
    blobId: string;
}, Promise<string>>;
//# sourceMappingURL=transfer.d.ts.map