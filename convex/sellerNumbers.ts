import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { hasAnyEventRoleOrAdmin } from './eventRoles';
import { resolveEventFeatures } from './eventFeatures';
import { appError } from './errors';

/**
 * Seller numbers: every seller of an event gets a short running number (1, 2, …) for
 * labels, sorting items back after the bazaar and calling sellers at the pay-out.
 * Numbers are never reused within an event, so a number stays unique after a seller left.
 */
export async function nextSellerNumber(ctx: MutationCtx, eventId: Id<'events'>): Promise<number> {
  const event = await ctx.db.get(eventId);
  if (!event) throw appError('notFound.event');
  const rows = await ctx.db
    .query('eventSeller')
    .withIndex('by_event_user', (q) => q.eq('event', eventId))
    .collect();
  // The counter on the event remembers numbers of sellers who left in the meantime
  const highest = rows.reduce((max, row) => Math.max(max, row.number ?? 0), 0);
  const number = Math.max(highest, event.lastSellerNumber ?? 0) + 1;
  await ctx.db.patch(eventId, { lastSellerNumber: number });
  return number;
}

/** The seller's row of the event with a number; created or numbered if missing. */
export async function ensureSellerRow(
  ctx: MutationCtx,
  event: Doc<'events'>,
  userId: Id<'users'>
): Promise<Doc<'eventSeller'>> {
  const row = await ctx.db
    .query('eventSeller')
    .withIndex('by_event_user', (q) => q.eq('event', event._id).eq('user', userId))
    .first();
  if (row?.number !== undefined) return row;
  const number = await nextSellerNumber(ctx, event._id);
  if (row) {
    await ctx.db.patch(row._id, { number });
    return { ...row, number };
  }
  const id = await ctx.db.insert('eventSeller', {
    event: event._id,
    user: userId,
    totalFee: 0,
    comissionFee: 0,
    numberpayoutAmount: 0,
    payoutReceived: false,
    number,
  });
  return (await ctx.db.get(id))!;
}

/**
 * Gives every seller of the event a number who has none yet, in the order they joined.
 * Sellers from before numbers existed get theirs when the event team opens the lists.
 * Event team and admins only; does nothing when all sellers have a number.
 */
export const assignMissingSellerNumbers = mutation({
  args: { eventId: v.id('events') },
  handler: async (ctx, { eventId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw appError('auth.required');
    if (!(await hasAnyEventRoleOrAdmin(ctx, eventId, userId, ['organizer', 'coorganizer']))) {
      throw appError('auth.forbidden');
    }
    const event = await ctx.db.get(eventId);
    if (!event) throw appError('notFound.event');
    const roles = await ctx.db
      .query('eventRole')
      .withIndex('by_event_role', (q) => q.eq('event', eventId).eq('roles', 'seller'))
      .collect();
    let assigned = 0;
    for (const role of roles) {
      const before = await ctx.db
        .query('eventSeller')
        .withIndex('by_event_user', (q) => q.eq('event', eventId).eq('user', role.user))
        .first();
      if (before?.number !== undefined) continue;
      await ensureSellerRow(ctx, event, role.user);
      assigned++;
    }
    return assigned;
  },
});

/** The current user's seller number at an event, or null. */
export const getMySellerNumber = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, { eventId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const row = await ctx.db
      .query('eventSeller')
      .withIndex('by_event_user', (q) => q.eq('event', eventId).eq('user', userId))
      .first();
    return row?.number ?? null;
  },
});

/** Number of items the seller has registered for the event (any status). */
async function countSellerItems(
  ctx: QueryCtx,
  eventId: Id<'events'>,
  vendorId: Id<'users'>
): Promise<number> {
  const products = await ctx.db
    .query('products')
    .withIndex('by_vendorId', (q) => q.eq('vendorId', vendorId))
    .collect();
  let count = 0;
  for (const product of products) {
    const relation = await ctx.db
      .query('eventProducts')
      .withIndex('by_eventId_productId', (q) =>
        q.eq('eventId', eventId).eq('productId', product._id)
      )
      .first();
    if (relation) count++;
  }
  return count;
}

/** Throws when `adding` more items would exceed the event's limit per seller. */
export async function assertItemLimit(
  ctx: QueryCtx,
  event: Doc<'events'>,
  vendorId: Id<'users'>,
  adding: number
) {
  const limit = resolveEventFeatures(event).maxItemsPerSeller;
  if (limit === undefined || adding <= 0) return;
  const current = await countSellerItems(ctx, event._id, vendorId);
  if (current + adding > limit) {
    const left = Math.max(limit - current, 0);
    throw appError('seller.itemLimit', { event: event.title, limit, left });
  }
}
