import { AwsClient } from "aws4fetch";
import type {
  BlobStore,
  S3BlobStoreConfig,
  UploadUrlOptions,
  DownloadUrlOptions,
  PutOptions,
  BlobMetadata,
  DeleteResult,
} from "./types.js";

const DEFAULT_EXPIRES_IN = 3600; // 1 hour
const SHORT_EXPIRES_IN = 60; // 60 seconds for immediate operations

/**
 * Create a BlobStore backed by an S3-compatible object storage service.
 * Uses AWS Signature V4 for authentication via presigned URLs.
 *
 * All operations use presigned URLs with query-string signatures for
 * compatibility with S3-compatible services like Tigris that may handle
 * header-based auth differently than AWS S3.
 */
export function createS3BlobStore(config: S3BlobStoreConfig): BlobStore {
  const { accessKeyId, secretAccessKey, region = "auto" } = config;
  const baseUrl = config.endpoint.replace(/\/$/, ""); // trim trailing slash

  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    region,
    service: "s3",
    retries: 0, // Don't retry on server errors; let caller handle retries
  });

  function buildUrl(key: string): string {
    return `${baseUrl}/${encodeURIComponent(key)}`;
  }

  /**
   * Generate a presigned URL for any S3 operation.
   * Uses query-string signatures for broad compatibility.
   */
  async function generatePresignedUrl(
    key: string,
    method: "GET" | "PUT" | "HEAD" | "DELETE",
    opts?: { expiresIn?: number },
  ): Promise<string> {
    const expiresIn = opts?.expiresIn ?? DEFAULT_EXPIRES_IN;

    // Build URL with X-Amz-Expires query param BEFORE signing
    const url = new URL(buildUrl(key));
    url.searchParams.set("X-Amz-Expires", String(expiresIn));

    // Sign with signQuery: true to put signature in query string
    const signedRequest = await client.sign(url.toString(), {
      method,
      aws: { signQuery: true },
    });

    return signedRequest.url.toString();
  }

  return {
    async generateUploadUrl(
      key: string,
      opts?: UploadUrlOptions,
    ): Promise<string> {
      return generatePresignedUrl(key, "PUT", opts);
    },

    async generateDownloadUrl(
      key: string,
      opts?: DownloadUrlOptions,
    ): Promise<string> {
      return generatePresignedUrl(key, "GET", opts);
    },

    async put(
      key: string,
      data: Blob | Uint8Array,
      opts?: PutOptions,
    ): Promise<void> {
      const presignedUrl = await generatePresignedUrl(key, "PUT", {
        expiresIn: SHORT_EXPIRES_IN,
      });

      const headers: Record<string, string> = {};
      if (opts?.contentType) {
        headers["Content-Type"] = opts.contentType;
      }

      const response = await fetch(presignedUrl, {
        method: "PUT",
        headers,
        body: data as BodyInit,
      });

      if (!response.ok) {
        throw new Error(
          `Failed to put blob: ${response.status} ${response.statusText}`,
        );
      }
    },

    async get(key: string): Promise<Blob | null> {
      const url = buildUrl(key);

      // Use header-based auth so we can include X-Tigris-Consistent
      const response = await client.fetch(url, {
        method: "GET",
        headers: {
          // Tigris: ensure read-your-writes consistency by reading from primary
          "X-Tigris-Consistent": "true",
        },
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(
          `Failed to get blob: ${response.status} ${response.statusText}`,
        );
      }

      return response.blob();
    },

    async head(key: string): Promise<BlobMetadata | null> {
      const url = buildUrl(key);

      // Use header-based auth so we can include X-Tigris-Consistent
      const response = await client.fetch(url, {
        method: "HEAD",
        headers: {
          // Tigris: ensure read-your-writes consistency by reading from primary
          "X-Tigris-Consistent": "true",
        },
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(
          `Failed to head blob: ${response.status} ${response.statusText}`,
        );
      }

      const contentType = response.headers.get("Content-Type") ?? undefined;
      const contentLengthHeader = response.headers.get("Content-Length");
      const contentLength = contentLengthHeader
        ? parseInt(contentLengthHeader, 10)
        : 0;

      return { contentType, contentLength };
    },

    async exists(key: string): Promise<boolean> {
      const metadata = await this.head(key);
      return metadata !== null;
    },

    async delete(key: string): Promise<DeleteResult> {
      const presignedUrl = await generatePresignedUrl(key, "DELETE", {
        expiresIn: SHORT_EXPIRES_IN,
      });

      const response = await fetch(presignedUrl, { method: "DELETE" });

      if (response.status === 404) {
        return { status: "not_found" };
      }

      if (!response.ok) {
        throw new Error(
          `Failed to delete blob: ${response.status} ${response.statusText}`,
        );
      }

      return { status: "deleted" };
    },
  };
}
