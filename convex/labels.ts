import { ConvexError, v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { query } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { findActiveEventListing } from './eventProducts';
import { hasAnyEventRoleOrAdmin } from './eventRoles';
import { resolveEventFeatures, showsPriceOnLabel } from './eventFeatures';
import type { LabelFormat } from './constants';

/** More labels at once would be a huge PDF; nobody prints that many in one go. */
const MAX_LABELS = 500;

/**
 * What goes on the labels of the given items: title, seller number and size, and the
 * price where the bazaar wants it printed. With `eventId` the labels are for that
 * bazaar (event team or the items' seller); without, each item's current or next
 * bazaar is used (own items only). The format is the bazaar's label sheet.
 */
export const getLabelData = query({
  args: {
    productIds: v.array(v.id('products')),
    eventId: v.optional(v.id('events')),
  },
  handler: async (ctx, { productIds, eventId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    if (productIds.length > MAX_LABELS) {
      throw new ConvexError(`Höchstens ${MAX_LABELS} Etiketten auf einmal.`);
    }

    const event = eventId ? await ctx.db.get(eventId) : null;
    if (eventId && !event) throw new ConvexError('Veranstaltung nicht gefunden.');
    const isTeam =
      !!event &&
      (await hasAnyEventRoleOrAdmin(ctx, event._id, userId, ['organizer', 'coorganizer']));

    const now = Date.now();
    const formats = new Set<LabelFormat>();
    const numbers = new Map<string, number | undefined>();
    const labels = [];
    for (const productId of productIds) {
      const product = await ctx.db.get(productId);
      if (!product) continue;
      if (product.vendorId !== userId) {
        // Others' items only for the event team, and only items of that bazaar
        const relation =
          event &&
          (await ctx.db
            .query('eventProducts')
            .withIndex('by_eventId_productId', (q) =>
              q.eq('eventId', event._id).eq('productId', productId)
            )
            .first());
        if (!isTeam || !relation) throw new Error('Not authorized');
      }

      const labelEvent: Doc<'events'> | null =
        event ?? (await findActiveEventListing(ctx, productId, now))?.event ?? null;
      let sellerNumber: number | undefined;
      if (labelEvent) {
        const key = `${labelEvent._id}:${product.vendorId}`;
        if (!numbers.has(key)) {
          const row = await ctx.db
            .query('eventSeller')
            .withIndex('by_event_user', (q) =>
              q.eq('event', labelEvent._id).eq('user', product.vendorId)
            )
            .first();
          numbers.set(key, row?.number);
        }
        sellerNumber = numbers.get(key);
        formats.add(resolveEventFeatures(labelEvent).labelFormat);
      }

      labels.push({
        productId,
        title: product.title,
        sellerNumber,
        size: product.attributes?.size,
        price: labelEvent && showsPriceOnLabel(labelEvent) ? product.price : undefined,
      });
    }

    // Items of different bazaars with different sheets: fall back to the large labels
    const format: LabelFormat = formats.size === 1 ? [...formats][0] : 'standard';
    return { format, labels };
  },
});
