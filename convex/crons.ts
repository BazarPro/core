import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

crons.daily(
  'cleanup orphaned uploads',
  { hourUTC: 2, minuteUTC: 30 },
  internal.storageCleanup.cleanupOrphanedUploads,
  { batchSize: 500 }
);

export default crons;
