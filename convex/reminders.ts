import { v } from 'convex/values';
import { internalMutation, type MutationCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { eveningBefore } from './berlinTime';
import { loadVendorsWithCalculations } from './eventRoles';
import { notifyUser } from './notifications';
import { dayBeforeInfo, pickupReminder } from './reminderContent';

const HOUR = 60 * 60 * 1000;
/** Pickup reminders only shortly after the end, not for long-gone bazaars */
const PICKUP_WINDOW = 12 * HOUR;
/** Gap between two mails, so the SMTP server does not throttle */
const SEND_GAP_MS = 1000;

/** Hourly: finds bazaars whose seller reminders are due and sends them one by one. */
export const sendDueReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const starting = await ctx.db
      .query('events')
      .withIndex('by_startDate', (q) => q.gt('startDate', now).lte('startDate', now + 48 * HOUR))
      .collect();
    for (const event of starting) {
      if (event.moderation || event.remindersSent?.dayBefore === event.startDate) continue;
      if (now < eveningBefore(event.startDate)) continue;
      await ctx.scheduler.runAfter(0, internal.reminders.sendDayBeforeInfo, {
        eventId: event._id,
      });
    }

    const ended = await ctx.db
      .query('events')
      .withIndex('by_endDate', (q) => q.gte('endDate', now - PICKUP_WINDOW).lte('endDate', now))
      .collect();
    for (const event of ended) {
      if (event.moderation || event.remindersSent?.pickup === event.endDate) continue;
      await ctx.scheduler.runAfter(0, internal.reminders.sendPickupReminder, {
        eventId: event._id,
      });
    }
  },
});

/** Items of the event per seller and status. */
async function itemsBySeller(ctx: MutationCtx, eventId: Id<'events'>) {
  const bySeller = new Map<
    Id<'users'>,
    { status: Doc<'eventProducts'>['status']; title: string }[]
  >();
  const relations = await ctx.db
    .query('eventProducts')
    .withIndex('by_eventId', (q) => q.eq('eventId', eventId))
    .collect();
  for (const relation of relations) {
    const product = await ctx.db.get(relation.productId);
    if (!product) continue;
    const list = bySeller.get(product.vendorId) ?? [];
    list.push({ status: relation.status, title: product.title });
    bySeller.set(product.vendorId, list);
  }
  return bySeller;
}

async function sellerIds(ctx: MutationCtx, eventId: Id<'events'>) {
  const roles = await ctx.db
    .query('eventRole')
    .withIndex('by_event_role', (q) => q.eq('event', eventId).eq('roles', 'seller'))
    .collect();
  return [...new Set(roles.map((role) => role.user))];
}

/** Evening before: everything sellers need, only to those with registered items. */
export const sendDayBeforeInfo = internalMutation({
  args: { eventId: v.id('events') },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event || event.remindersSent?.dayBefore === event.startDate) return 0;
    await ctx.db.patch(eventId, {
      remindersSent: { ...event.remindersSent, dayBefore: event.startDate },
    });

    const items = await itemsBySeller(ctx, eventId);
    let sent = 0;
    for (const sellerId of await sellerIds(ctx, eventId)) {
      const itemCount = (items.get(sellerId) ?? []).filter(
        (item) => item.status === 'announced' || item.status === 'available'
      ).length;
      if (itemCount === 0) continue;
      const row = await ctx.db
        .query('eventSeller')
        .withIndex('by_event_user', (q) => q.eq('event', eventId).eq('user', sellerId))
        .first();
      await notifyUser(
        ctx,
        sellerId,
        dayBeforeInfo(event, { itemCount, sellerNumber: row?.number }),
        undefined,
        sent * SEND_GAP_MS
      );
      sent++;
    }
    return sent;
  },
});

/** After the end: sellers not yet paid out pick up their unsold items and money. */
export const sendPickupReminder = internalMutation({
  args: { eventId: v.id('events') },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event || event.remindersSent?.pickup === event.endDate) return 0;
    await ctx.db.patch(eventId, {
      remindersSent: { ...event.remindersSent, pickup: event.endDate },
    });

    const items = await itemsBySeller(ctx, eventId);
    let sent = 0;
    for (const vendor of await loadVendorsWithCalculations(ctx, eventId)) {
      if (vendor.paid) continue;
      const own = items.get(vendor._id) ?? [];
      // Never handed anything in: nothing to pick up
      if (!own.some((item) => item.status !== 'announced')) continue;
      await notifyUser(
        ctx,
        vendor._id,
        pickupReminder(event, {
          soldCount: own.filter((item) => item.status === 'sold').length,
          payout: vendor.payout,
          unsoldTitles: own.filter((item) => item.status === 'available').map((item) => item.title),
        }),
        undefined,
        sent * SEND_GAP_MS
      );
      sent++;
    }
    return sent;
  },
});
