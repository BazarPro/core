import { mutation, query } from './_generated/server';
import { v, ConvexError } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { hasEventRole, hasEventRoleOrAdmin } from './eventRoles';
import { sumPurchasesForSellerAtEvent } from './eventSellerAggregates';

/**
 * Allows a user to join an event as a seller
 * @param args.eventId - ID of the event to join
 * @param args.accessCode - Optional access code for private events
 * @returns Promise<Id<'eventSeller'>> - ID of the created eventSeller record
 */
export const joinEvent = mutation({
  args: {
    eventId: v.id('events'),
    accessCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    const isDemoMode = await ctx.db
      .query('featureFlags')
      .withIndex('by_key', (q) => q.eq('key', 'is_demo_mode'))
      .first();

    if (!userId) {
      throw new ConvexError('Not authenticated');
    }

    const event = await ctx.db.get(args.eventId);

    if (!event) {
      throw new ConvexError('Event not found');
    }

    if (event.endDate < Date.now()) {
      throw new ConvexError(
        'Beitritt nicht möglich: Veranstaltung liegt bereits in der Vergangenheit.'
      );
    }

    if (event.accessCode !== args.accessCode || (isDemoMode?.value && args.accessCode === 'DEMO')) {
      throw new ConvexError('Invalid access code');
    }

    if (await hasEventRole(ctx, args.eventId, userId, 'seller')) {
      const existingSeller = await ctx.db
        .query('eventSeller')
        .withIndex('by_event_user', (q) => q.eq('event', args.eventId).eq('user', userId))
        .first();
      if (existingSeller) return existingSeller._id;
      throw new Error('Data inconsistency: seller role without eventSeller entry');
    }

    // Check Vendor Limit
    if (event.vendorLimit) {
      const sellerCount = await ctx.db
        .query('eventRole')
        .withIndex('by_event_role', (q) => q.eq('event', args.eventId).eq('roles', 'seller'))
        .collect();
      if (sellerCount.length >= event.vendorLimit) {
        throw new ConvexError('Vendor limit reached');
      }
    }

    // Join Event
    const sellerId = await ctx.db.insert('eventSeller', {
      event: args.eventId,
      user: userId,
      totalFee: 0,
      comissionFee: 0,
      saleFeeFixed: event.saleFeeFixed,
      saleFeePercentage: event.saleFeePercentage,
      numberpayoutAmount: 0,
      payoutReceived: false,
    });

    // Set eventRole for seller
    await ctx.db.insert('eventRole', {
      event: args.eventId,
      user: userId,
      roles: 'seller',
    });

    return sellerId;
  },
});

export const removeSellerAndCoorganizerRoles = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;

    const sellerEventRoles = await ctx.db
      .query('eventRole')
      .withIndex('by_user_role', (q) => q.eq('user', userId).eq('roles', 'seller'))
      .collect();

    const coorganizerEventRoles = await ctx.db
      .query('eventRole')
      .withIndex('by_user_role', (q) => q.eq('user', userId).eq('roles', 'coorganizer'))
      .collect();

    // delete seller roles
    for (const sellerRole of sellerEventRoles) {
      const productsInSale = await ctx.db
        .query('eventProducts')
        .withIndex('by_eventId', (q) => q.eq('eventId', sellerRole.event))
        .collect();

      // Check if user has items Listet in Event
      for (const eventProduct of productsInSale) {
        const product = await ctx.db.get(eventProduct.productId);

        if (!product) continue;

        //if products from owner found in event, delete these eventProducts from event
        if (product.vendorId === userId) {
          console.log('deleting eventProcuct: ', eventProduct);
          await ctx.db.delete(eventProduct._id);
        }
      }
      console.log('deleting sellerRole: ', sellerRole);
      await ctx.db.delete(sellerRole._id);
    }

    // delete coorganizer roles
    for (const coorganizerRole of coorganizerEventRoles) {
      await ctx.db.delete(coorganizerRole._id);
    }
  },
});
/**
 * Checks if the current user is a seller for a specific event
 * @param args.eventId - ID of the event to check
 * @returns Promise<boolean> - True if user is a seller for the event
 */
export const isEventSellerForEvent = query({
  args: {
    eventId: v.id('events'),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;

    const sellerRole = await ctx.db
      .query('eventRole')
      .withIndex('by_event_user_role', (q) =>
        q.eq('event', args.eventId).eq('user', userId).eq('roles', 'seller')
      )
      .unique();
    return !!sellerRole;
  },
});

export const checkAccessCode = query({
  args: {
    eventId: v.id('events'),
    accessCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);

    const isDemoMode = await ctx.db
      .query('featureFlags')
      .withIndex('by_key', (q) => q.eq('key', 'is_demo_mode'))
      .first();

    if (!event) {
      throw new ConvexError('Event not found');
    }
    return (
      event.accessCode === args.accessCode || (isDemoMode?.value && args.accessCode === 'DEMO')
    );
  },
});

export const markVendorPayoutReceived = mutation({
  args: {
    eventId: v.id('events'),
    vendorUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError('Not authenticated');
    }

    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new ConvexError('Event not found');
    }

    const isOrganizer = await hasEventRoleOrAdmin(ctx, args.eventId, userId, 'organizer');
    if (!isOrganizer) {
      throw new ConvexError('Nur Veranstalter können Auszahlungen als erledigt markieren');
    }

    const isSeller = await hasEventRole(ctx, args.eventId, args.vendorUserId, 'seller');
    if (!isSeller) {
      throw new ConvexError('Nutzer ist kein Verkäufer für dieses Event');
    }

    const totals = await sumPurchasesForSellerAtEvent(ctx, args.eventId, args.vendorUserId);

    const row = await ctx.db
      .query('eventSeller')
      .withIndex('by_event_user', (q) => q.eq('event', args.eventId).eq('user', args.vendorUserId))
      .first();

    if (row) {
      if (row.payoutReceived) return;
      await ctx.db.patch(row._id, {
        comissionFee: totals.comissionFee,
        numberpayoutAmount: totals.numberpayoutAmount,
        payoutReceived: true,
      });
      return;
    }

    await ctx.db.insert('eventSeller', {
      event: args.eventId,
      user: args.vendorUserId,
      totalFee: 0,
      comissionFee: totals.comissionFee,
      saleFeeFixed: event.saleFeeFixed,
      saleFeePercentage: event.saleFeePercentage,
      numberpayoutAmount: totals.numberpayoutAmount,
      payoutReceived: true,
    });
  },
});

export const unmarkVendorPayoutReceived = mutation({
  args: {
    eventId: v.id('events'),
    vendorUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError('Not authenticated');
    }

    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new ConvexError('Event not found');
    }

    const isOrganizer = await hasEventRoleOrAdmin(ctx, args.eventId, userId, 'organizer');
    if (!isOrganizer) {
      throw new ConvexError('Nur Veranstalter können Auszahlungsmarkierungen zurücknehmen');
    }

    const isSeller = await hasEventRole(ctx, args.eventId, args.vendorUserId, 'seller');
    if (!isSeller) {
      throw new ConvexError('Nutzer ist kein Verkäufer für dieses Event');
    }

    const row = await ctx.db
      .query('eventSeller')
      .withIndex('by_event_user', (q) => q.eq('event', args.eventId).eq('user', args.vendorUserId))
      .first();

    if (!row || !row.payoutReceived) {
      return;
    }

    await ctx.db.patch(row._id, {
      payoutReceived: false,
      comissionFee: 0,
      numberpayoutAmount: 0,
    });
  },
});
