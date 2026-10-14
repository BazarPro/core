import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

crons.daily(
  'cleanup orphaned uploads',
  { hourUTC: 2, minuteUTC: 30 },
  internal.storageCleanup.cleanupOrphanedUploads,
  { batchSize: 500 }
);

// Offers of ended events can no longer be answered or redeemed
crons.hourly(
  'expire offers of ended events',
  { minuteUTC: 5 },
  internal.offers.expireOffersOfEndedEvents,
  {}
);

export default crons;
