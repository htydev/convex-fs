import type {
  BlobStore,
  BlobMetadata,
  DeleteResult,
  BunnyBlobStoreConfig,
  UploadUrlOptions,
  DownloadUrlOptions,
  PutOptions,
} from "./types";

const DEFAULT_TOKEN_TTL = 3600; // 1 hour

/**
 * Sign a Bunny CDN URL using token authentication (advanced mode with SHA256).
 * Reference: https://docs.bunny.net/docs/cdn-token-authentication
 *
 * Note: Requires "URL Token Authentication" to be enabled on the Pull Zone
 * with the authentication type set to use SHA256 (advanced mode).
 */
async function signBunnyUrl(
  baseUrl: string,
  path: string,
  tokenKey: string,
  expiresIn: number,
): Promise<string> {
  const expirationTimestamp = Math.floor(Date.now() / 1000) + expiresIn;

  // Advanced token format: SHA256(token_security_key + path + expiration)
  const tokenContent = `${tokenKey}${path}${expirationTimestamp}`;

  // Compute SHA256 hash using Web Crypto
  const encoder = new TextEncoder();
  const data = encoder.encode(tokenContent);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);

  // Base64 encode and make URL-safe
  const base64Token = btoa(String.fromCharCode(...hashArray))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return `${baseUrl}${path}?token=${base64Token}&expires=${expirationTimestamp}`;
}

/**
 * Creates a BlobStore implementation backed by Bunny.net Edge Storage
 * with CDN delivery via Pull Zone.
 *
 * Note: Bunny.net does not support presigned upload URLs natively.
 * Use the HTTP upload proxy endpoint for client uploads instead.
 */
export function createBunnyBlobStore(config: BunnyBlobStoreConfig): BlobStore {
  const {
    apiKey,
    storageZoneName,
    region = "",
    cdnHostname,
    tokenKey,
  } = config;

  // Build storage endpoint based on region
  // Frankfurt (default) uses storage.bunnycdn.com
  // Other regions use {region}.storage.bunnycdn.com
  const storageHost = region
    ? `${region}.storage.bunnycdn.com`
    : "storage.bunnycdn.com";

  const cdnBaseUrl = `https://${cdnHostname}`;

  function buildStorageUrl(key: string): string {
    return `https://${storageHost}/${storageZoneName}/${key}`;
  }

  return {
    async generateUploadUrl(
      _key: string,
      _opts?: UploadUrlOptions,
    ): Promise<string> {
      // Bunny.net does not support presigned upload URLs natively.
      // Client uploads should go through the HTTP upload proxy endpoint.
      throw new Error(
        "Bunny.net storage does not support presigned upload URLs. " +
          "Use the HTTP upload proxy endpoint instead.",
      );
    },

    async generateDownloadUrl(
      key: string,
      opts?: DownloadUrlOptions,
    ): Promise<string> {
      const path = `/${key}`;

      // If token authentication is configured, sign the URL
      if (tokenKey) {
        const expiresIn = opts?.expiresIn ?? DEFAULT_TOKEN_TTL;
        return signBunnyUrl(cdnBaseUrl, path, tokenKey, expiresIn);
      }

      // No token auth - return plain CDN URL
      return `${cdnBaseUrl}${path}`;
    },

    async put(
      key: string,
      data: Blob | Uint8Array,
      opts?: PutOptions,
    ): Promise<void> {
      const url = buildStorageUrl(key);
      const contentType = opts?.contentType ?? "application/octet-stream";

      // Convert Uint8Array to Blob for fetch body compatibility
      const body =
        data instanceof Uint8Array
          ? new Blob([new Uint8Array(data).buffer as ArrayBuffer])
          : data;

      const response = await fetch(url, {
        method: "PUT",
        headers: {
          AccessKey: apiKey,
          "Content-Type": contentType,
        },
        body,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Failed to put blob to Bunny: ${response.status} ${response.statusText}${text ? ` - ${text}` : ""}`,
        );
      }
    },

    async get(key: string): Promise<Blob | null> {
      const url = buildStorageUrl(key);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          AccessKey: apiKey,
        },
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Failed to get blob from Bunny: ${response.status} ${response.statusText}${text ? ` - ${text}` : ""}`,
        );
      }

      return response.blob();
    },

    async head(key: string): Promise<BlobMetadata | null> {
      const url = buildStorageUrl(key);

      // Bunny doesn't have a dedicated HEAD endpoint, so we use a Range request
      // to fetch just the first byte and extract metadata from headers
      const response = await fetch(url, {
        method: "GET",
        headers: {
          AccessKey: apiKey,
          Range: "bytes=0-0",
        },
      });

      if (response.status === 404) {
        return null;
      }

      // 206 Partial Content is the expected response for a Range request
      if (!response.ok && response.status !== 206) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Failed to head blob from Bunny: ${response.status} ${response.statusText}${text ? ` - ${text}` : ""}`,
        );
      }

      const contentType = response.headers.get("Content-Type") ?? undefined;

      // Content-Range header format: "bytes 0-0/12345" where 12345 is total size
      const contentRange = response.headers.get("Content-Range");
      let contentLength = 0;
      if (contentRange) {
        const match = contentRange.match(/\/(\d+)$/);
        if (match) {
          contentLength = parseInt(match[1], 10);
        }
      } else {
        // Fallback to Content-Length if no Content-Range
        const lengthHeader = response.headers.get("Content-Length");
        if (lengthHeader) {
          contentLength = parseInt(lengthHeader, 10);
        }
      }

      return { contentType, contentLength };
    },

    async exists(key: string): Promise<boolean> {
      const metadata = await this.head(key);
      return metadata !== null;
    },

    async delete(key: string): Promise<DeleteResult> {
      const url = buildStorageUrl(key);

      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          AccessKey: apiKey,
        },
      });

      if (response.status === 404) {
        return { status: "not_found" };
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Failed to delete blob from Bunny: ${response.status} ${response.statusText}${text ? ` - ${text}` : ""}`,
        );
      }

      return { status: "deleted" };
    },
  };
}
