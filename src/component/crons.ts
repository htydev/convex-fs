import { cronJobs } from "convex/server";
import { internal } from "./_generated/api.js";

const crons = cronJobs();

/**
 * UGC: GC expired uploads every hour at :00.
 *
 * Cleans up upload records where the presigned URL has expired
 * (plus a 1-hour grace period). Also deletes the corresponding
 * blobs from object storage.
 *
 * The job runs to completion by scheduling follow-up runs if
 * there are more than 100 expired uploads to process (unless
 * S3 errors occur, to avoid hammering during outages).
 */
crons.cron(
  "gc-expired-uploads",
  "0 * * * *", // Every hour at :00
  internal.background.gcExpiredUploads,
);

/**
 * BGC: GC orphaned blobs every hour at :20.
 *
 * Cleans up blobs with refCount=0 that have been orphaned for
 * longer than the configured grace period (default 24 hours).
 *
 * The job runs to completion by scheduling follow-up runs if
 * there are more than 100 orphaned blobs to process (unless
 * S3 errors occur, to avoid hammering during outages).
 */
crons.cron(
  "gc-orphaned-blobs",
  "20 * * * *", // Every hour at :20
  internal.background.gcOrphanedBlobs,
);

/**
 * DGC: GC expired download URL cache entries every hour at :40.
 *
 * Cleans up cached presigned download URLs that have expired.
 * This is purely a DB cleanup - no S3 interaction needed.
 *
 * The job runs to completion by scheduling follow-up runs if
 * there are more than 100 expired entries to process.
 */
crons.cron(
  "gc-expired-download-urls",
  "40 * * * *", // Every hour at :40
  internal.background.gcExpiredDownloadUrls,
);

export default crons;
