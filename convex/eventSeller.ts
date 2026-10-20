import { mutation, query, type MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { hasAnyEventRoleOrAdmin, hasEventRole } from './eventRoles';
import { sumPurchasesForSellerAtEvent } from './eventSellerAggregates';
import { closeOffersForEventProduct } from './offers';
import { nextSellerNumber } from './sellerNumbers';
import { intakeFeeForSeller } from './intakeFees';
import { appError } from './errors';

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
      throw appError('auth.required');
    }

    const event = await ctx.db.get(args.eventId);

    if (!event) {
      throw appError('notFound.event');
    }

    if (event.moderation) {
      throw appError('event.blocked');
    }

    if (event.endDate < Date.now()) {
      throw appError('join.past');
    }

    // In demo mode the code "DEMO" opens every event (same rule as checkAccessCode)
    const isDemoCode = isDemoMode?.value === true && args.accessCode === 'DEMO';
    if (event.accessCode !== args.accessCode && !isDemoCode) {
      throw appError('join.invalidCode');
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
        throw appError('join.vendorLimit');
      }
    }

    // Join Event
    const sellerId = await ctx.db.insert('eventSeller', {
      event: args.eventId,
      user: userId,
      totalFee: 0,
      comissionFee: 0,
      numberpayoutAmount: 0,
      payoutReceived: false,
      number: await nextSellerNumber(ctx, args.eventId),
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

/**
 * Removes all seller and co-organizer roles of a user, including the
 * user's products listed in those events.
 */
export async function removeSellerAndCoorganizerRolesForUser(
  ctx: MutationCtx,
  userId: Id<'users'>
) {
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
}

export const removeSellerAndCoorganizerRoles = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;

    await removeSellerAndCoorganizerRolesForUser(ctx, userId);
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
      throw appError('notFound.event');
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
    await recordPayout(ctx, args.eventId, args.vendorUserId);
  },
});

/**
 * Settles a seller in one step at the end of the event: their unsold items go back
 * to them (available → returned) and the payout is marked as done. Organizers and helpers.
 * @returns Number of items marked as returned
 */
export const settleVendor = mutation({
  args: {
    eventId: v.id('events'),
    vendorUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    await recordPayout(ctx, args.eventId, args.vendorUserId);

    const eventProducts = await ctx.db
      .query('eventProducts')
      .withIndex('by_eventId', (q) => q.eq('eventId', args.eventId))
      .collect();
    let returned = 0;
    for (const ep of eventProducts) {
      if (ep.status !== 'available') continue;
      const product = await ctx.db.get(ep.productId);
      if (product?.vendorId !== args.vendorUserId) continue;
      await ctx.db.patch(ep._id, { status: 'returned' });
      await closeOffersForEventProduct(ctx, ep._id, product.title, 'return');
      returned++;
    }
    return { returned };
  },
});

/** Marks the payout of a seller as done and stores the totals. No-op when already paid. */
async function recordPayout(ctx: MutationCtx, eventId: Id<'events'>, vendorUserId: Id<'users'>) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw appError('auth.required');
  }

  const event = await ctx.db.get(eventId);
  if (!event) {
    throw appError('notFound.event');
  }

  // Helpers (coorganizers) run the cash desk and settle sellers as well
  if (!(await hasAnyEventRoleOrAdmin(ctx, eventId, userId, ['organizer', 'coorganizer']))) {
    throw appError('seller.payoutStaffOnly');
  }

  const isSeller = await hasEventRole(ctx, eventId, vendorUserId, 'seller');
  if (!isSeller) {
    throw appError('seller.notSeller');
  }

  const totals = await sumPurchasesForSellerAtEvent(ctx, eventId, vendorUserId);

  const row = await ctx.db
    .query('eventSeller')
    .withIndex('by_event_user', (q) => q.eq('event', eventId).eq('user', vendorUserId))
    .first();

  if (row?.payoutReceived) return;
  // The intake fee is kept from the payout and stored, like the sales totals
  const fee = await intakeFeeForSeller(ctx, event, vendorUserId, row);
  const settlement = {
    comissionFee: totals.comissionFee,
    numberpayoutAmount: totals.numberpayoutAmount - fee.total,
    intakeFee: fee.total,
    intakeFeeItems: fee.items,
    payoutReceived: true,
  };
  if (row) {
    await ctx.db.patch(row._id, settlement);
    return;
  }

  await ctx.db.insert('eventSeller', {
    event: eventId,
    user: vendorUserId,
    totalFee: 0,
    ...settlement,
    number: await nextSellerNumber(ctx, eventId),
  });
}

export const unmarkVendorPayoutReceived = mutation({
  args: {
    eventId: v.id('events'),
    vendorUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw appError('auth.required');
    }

    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw appError('notFound.event');
    }

    if (!(await hasAnyEventRoleOrAdmin(ctx, args.eventId, userId, ['organizer', 'coorganizer']))) {
      throw appError('seller.undoPayoutStaffOnly');
    }

    const isSeller = await hasEventRole(ctx, args.eventId, args.vendorUserId, 'seller');
    if (!isSeller) {
      throw appError('seller.notSeller');
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
      intakeFee: undefined,
      intakeFeeItems: undefined,
    });
  },
});
