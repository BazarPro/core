import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import type { Id } from './_generated/dataModel';

/**
 * Deletes files in Convex Storage that are no longer referenced by
 * product images or event cover images.
 */
export const cleanupOrphanedUploads = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = Math.max(1, Math.min(args.batchSize ?? 500, 5000));

    const referencedStorageIds = new Set<Id<'_storage'>>();

    const products = await ctx.db.query('products').collect();
    for (const product of products) {
      for (const imageId of product.images) {
        referencedStorageIds.add(imageId);
      }
    }

    const events = await ctx.db.query('events').collect();
    for (const event of events) {
      if (event.coverImage) {
        referencedStorageIds.add(event.coverImage);
      }
      if (event.eventMapImage) {
        referencedStorageIds.add(event.eventMapImage);
      }
    }

    const storageFiles = await ctx.db.system.query('_storage').collect();
    let scanned = 0;
    let deleted = 0;

    for (const file of storageFiles) {
      if (scanned >= batchSize) {
        break;
      }
      scanned += 1;

      const fileId = file._id as Id<'_storage'>;
      if (referencedStorageIds.has(fileId)) {
        continue;
      }

      await ctx.storage.delete(fileId);
      deleted += 1;
    }

    return {
      scanned,
      deleted,
      totalFiles: storageFiles.length,
      referencedFiles: referencedStorageIds.size,
      remainingForNextRun: Math.max(storageFiles.length - scanned, 0),
    };
  },
});
