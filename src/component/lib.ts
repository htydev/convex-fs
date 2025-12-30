/**
 * Main entry point for the file storage component.
 * Re-exports all public API.
 */

// Public API from ops
export {
  stat,
  list,
  copyByPath,
  moveByPath,
  deleteByPath,
  getBlob,
  getFile,
  writeFile,
} from "./ops/basics.js";

export { commitFiles, transact } from "./ops/transact.js";

// Public API from transfer
export { getDownloadUrl, uploadBlob } from "./transfer.js";

// Public validators and types
export {
  configValidator,
  fileMetadataValidator,
  destValidator,
  opValidator,
} from "./types.js";

export type { Config, FileMetadata, Dest, Op } from "./types.js";
