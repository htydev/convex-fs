/**
 * Background jobs for the blob store component.
 *
 * This module will contain:
 * - Garbage collection for blobs with refCount=0 past grace period
 * - Cleanup for expired upload records
 * - Cleanup for expired download URL cache entries
 */
