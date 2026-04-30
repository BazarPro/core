import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { hasAnyEventRoleOrAdmin } from './eventRoles';

/**
 * Marks a product as sold and creates a purchase record
 * @param args.eventProductId - ID of the event-product relation to sell
 * @returns Promise<Id<'purchase'>> - ID of the created purchase record
 */
export const sellProduct = mutation({
  args: {
    eventProductId: v.id('eventProducts'),
  },
  handler: async (ctx, { eventProductId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    const ep = await ctx.db.get(eventProductId);
    if (!ep) throw new Error('Event-product relation not found');

    if (!(await hasAnyEventRoleOrAdmin(ctx, ep.eventId, userId, ['organizer', 'coorganizer']))) {
      throw new Error('Not authorized to sell products for this event');
    }

    const event = await ctx.db.get(ep.eventId);
    if (!event) throw new Error('Event not found');

    const product = await ctx.db.get(ep.productId);
    if (!product) throw new Error('Product not found');

    const sellerRow = await ctx.db
      .query('eventSeller')
      .withIndex('by_event_user', (q) => q.eq('event', ep.eventId).eq('user', product.vendorId))
      .first();
    if (sellerRow?.payoutReceived) {
      throw new Error(
        'Verkäufer wurde bereits ausbezahlt, weitere Verkäufe sind nicht mehr möglich.'
      );
    }

    if (ep.status !== 'available') {
      throw new Error('Product is not available for sale');
    }

    // Calculate commission and payout with discount
    let totalAmount = product.price;
    const discountPercent = ep.discountPercent;
    if (discountPercent && discountPercent > 0) {
      totalAmount = totalAmount * (1 - discountPercent / 100);
    }

    const commissionPercentage = event.commission;
    const commissionAmount = (totalAmount * commissionPercentage) / 100;
    const payoutAmount = totalAmount - commissionAmount;

    // Update status to sold
    await ctx.db.patch(eventProductId, { status: 'sold' });

    // Mark product itself as sold (optional, depending on global state preference)
    await ctx.db.patch(product._id, { sold: true });

    // Remove the product from all other events (keep only the sold event)
    const otherEventProducts = await ctx.db
      .query('eventProducts')
      .withIndex('by_productId', (q) => q.eq('productId', product._id))
      .collect();
    for (const relation of otherEventProducts) {
      if (relation.eventId !== ep.eventId) {
        await ctx.db.delete(relation._id);
      }
    }

    // Create purchase record
    const purchaseId = await ctx.db.insert('purchase', {
      product: product._id,
      event: event._id,
      seller: product.vendorId,
      totalAmount,
      comissionAmount: commissionAmount,
      payoutAmount,
      payoutStatus: false,
      payoutDate: 0, // Not paid out yet
      discountPercent,
    });

    return purchaseId;
  },
});

/**
 * Undoes a product sale (requires feature flag)
 * @param args.eventProductId - ID of the event-product relation to undo
 * @returns Promise<{success: boolean}> - Success status
 */
export const undoSale = mutation({
  args: {
    eventProductId: v.id('eventProducts'),
  },
  handler: async (ctx, { eventProductId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    // Check Feature Flag
    const flag = await ctx.db
      .query('featureFlags')
      .withIndex('by_key', (q) => q.eq('key', 'allow_undo_inventory_actions'))
      .unique();
    if (!flag || !flag.value) {
      throw new Error('Diese Aktion ist derzeit deaktiviert (Feature Flag)');
    }

    const ep = await ctx.db.get(eventProductId);
    if (!ep) throw new Error('Event-product relation not found');

    if (!(await hasAnyEventRoleOrAdmin(ctx, ep.eventId, userId, ['organizer', 'coorganizer']))) {
      throw new Error('Not authorized');
    }

    if (ep.status !== 'sold') {
      throw new Error('Produkt ist nicht als verkauft markiert');
    }

    const product = await ctx.db.get(ep.productId);
    if (!product) throw new Error('Product not found');

    // Find and delete purchase record
    const purchase = await ctx.db
      .query('purchase')
      .withIndex('by_event_seller', (q) => q.eq('event', ep.eventId).eq('seller', product.vendorId))
      .filter((q) => q.eq(q.field('product'), ep.productId))
      .first();

    if (purchase) {
      await ctx.db.delete(purchase._id);
    }

    // Reset statuses
    await ctx.db.patch(eventProductId, { status: 'available' });
    await ctx.db.patch(ep.productId, { sold: false });

    return { success: true };
  },
});

/**
 * Gets all purchases for a specific event
 * @param args.eventId - ID of the event
 * @returns Promise<Doc<'purchase'>[]> - Array of purchase records for the event
 */
export const getPurchasesForEvent = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, { eventId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    if (!(await hasAnyEventRoleOrAdmin(ctx, eventId, userId, ['organizer', 'coorganizer']))) {
      throw new Error('Not authorized');
    }

    return await ctx.db
      .query('purchase')
      .filter((q) => q.eq(q.field('event'), eventId))
      .collect();
  },
});
