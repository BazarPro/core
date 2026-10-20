import { ConvexError, v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { BROADCAST_AUDIENCES, type BroadcastAudience } from './constants';
import { hasAnyEventRoleOrAdmin, hasEventRole } from './eventRoles';
import { notifyUser } from './notifications';

const DAY = 24 * 60 * 60 * 1000;
/** Per bazaar and 24 hours, so sellers are not flooded */
export const MAX_BROADCASTS_PER_DAY = 5;
export const MAX_IMPORTANT_PER_DAY = 1;
const MAX_SUBJECT = 120;
const MAX_BODY = 5000;
/** Gap between two mails of one broadcast, so the SMTP server does not throttle */
const SEND_GAP_MS = 1000;

const audienceArg = v.union(...BROADCAST_AUDIENCES.map(v.literal));

/** Sellers of the event who get a message for this audience. */
async function recipientsFor(
  ctx: QueryCtx,
  eventId: Id<'events'>,
  audience: BroadcastAudience
): Promise<Id<'users'>[]> {
  const roles = await ctx.db
    .query('eventRole')
    .withIndex('by_event_role', (q) => q.eq('event', eventId).eq('roles', 'seller'))
    .collect();
  const sellers = [...new Set(roles.map((role) => role.user))];
  if (audience === 'all') return sellers;

  // 'accepted': items taken in at the bazaar; 'pickup': unsold items still there
  const withItems = new Set<Id<'users'>>();
  const relations = await ctx.db
    .query('eventProducts')
    .withIndex('by_eventId', (q) => q.eq('eventId', eventId))
    .collect();
  for (const relation of relations) {
    if (audience === 'pickup' ? relation.status !== 'available' : relation.status === 'announced') {
      continue;
    }
    const product = await ctx.db.get(relation.productId);
    if (product) withItems.add(product.vendorId);
  }
  return sellers.filter((seller) => withItems.has(seller));
}

async function requireOrganizer(ctx: QueryCtx, eventId: Id<'events'>) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('Not authenticated');
  // Helpers run the cash desk; writing to all sellers stays with the organizer
  if (!(await hasAnyEventRoleOrAdmin(ctx, eventId, userId, ['organizer']))) {
    throw new Error('Not authorized');
  }
  const event = await ctx.db.get(eventId);
  if (!event) throw new ConvexError('Veranstaltung nicht gefunden.');
  return { userId, event };
}

async function sentToday(ctx: QueryCtx, eventId: Id<'events'>, now: number) {
  return await ctx.db
    .query('eventBroadcasts')
    .withIndex('by_event', (q) => q.eq('eventId', eventId).gt('createdAt', now - DAY))
    .collect();
}

/** For the send dialog: how many sellers get it and what is left of today's limit. */
export const getBroadcastPreview = query({
  args: { eventId: v.id('events'), audience: audienceArg },
  handler: async (ctx, { eventId, audience }) => {
    await requireOrganizer(ctx, eventId);
    const today = await sentToday(ctx, eventId, Date.now());
    return {
      recipients: (await recipientsFor(ctx, eventId, audience)).length,
      left: Math.max(MAX_BROADCASTS_PER_DAY - today.length, 0),
      importantLeft: Math.max(
        MAX_IMPORTANT_PER_DAY - today.filter((broadcast) => broadcast.important).length,
        0
      ),
    };
  },
});

/**
 * Emails a message of the organizer to the sellers of the bazaar. Text only: links
 * stay visible as plain URLs. "Important" messages ignore the sellers' settings.
 */
export const sendSellerBroadcast = mutation({
  args: {
    eventId: v.id('events'),
    subject: v.string(),
    body: v.string(),
    audience: audienceArg,
    important: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId, event } = await requireOrganizer(ctx, args.eventId);
    const subject = args.subject.trim();
    const body = args.body.trim();
    if (subject.length < 3 || subject.length > MAX_SUBJECT) {
      throw new ConvexError(`Der Betreff braucht 3 bis ${MAX_SUBJECT} Zeichen.`);
    }
    if (body.length < 10 || body.length > MAX_BODY) {
      throw new ConvexError(`Die Nachricht braucht 10 bis ${MAX_BODY} Zeichen.`);
    }

    const now = Date.now();
    const today = await sentToday(ctx, args.eventId, now);
    if (today.length >= MAX_BROADCASTS_PER_DAY) {
      throw new ConvexError(
        `Höchstens ${MAX_BROADCASTS_PER_DAY} Nachrichten pro Tag. Versuche es morgen wieder.`
      );
    }
    if (
      args.important &&
      today.filter((broadcast) => broadcast.important).length >= MAX_IMPORTANT_PER_DAY
    ) {
      throw new ConvexError('Heute wurde schon eine wichtige Nachricht verschickt.');
    }

    const recipientIds = await recipientsFor(ctx, args.eventId, args.audience);
    if (recipientIds.length === 0) {
      throw new ConvexError('Keine Verkäufer, die diese Nachricht bekommen würden.');
    }
    await ctx.db.insert('eventBroadcasts', {
      eventId: args.eventId,
      senderId: userId,
      subject,
      body,
      audience: args.audience,
      important: args.important,
      recipientIds,
      createdAt: now,
    });

    const paragraphs = body.split(/\n\s*\n/).map((paragraph) => paragraph.trim());
    for (const [index, recipient] of recipientIds.entries()) {
      await addMessageNotice(ctx, recipient, args.eventId, now);
      await notifyUser(
        ctx,
        recipient,
        (t) => ({
          subject: args.important
            ? t('broadcast.subjectImportant', { subject, event: event.title })
            : t('broadcast.subject', { subject, event: event.title }),
          heading: args.important ? t('broadcast.headingImportant', { subject }) : subject,
          paragraphs: [t('broadcast.intro', { event: event.title }), ...paragraphs],
          link: { label: t('broadcast.link'), path: `/public-events/${event._id}` },
          ...(args.important ? {} : { category: 'organizer' as const }),
        }),
        undefined,
        index * SEND_GAP_MS
      );
    }
    return recipientIds.length;
  },
});

/**
 * Red marker on "Events" and the bazaar card, also for sellers who switched the
 * emails off. Walk-in sellers cannot log in and get none.
 */
async function addMessageNotice(
  ctx: MutationCtx,
  userId: Id<'users'>,
  eventId: Id<'events'>,
  createdAt: number
) {
  const user = await ctx.db.get(userId);
  if (!user || user.managedByEventId || user.status === 'deleted' || user.status === 'banned') {
    return;
  }
  await ctx.db.insert('unreadNotices', { userId, area: 'messages', eventId, createdAt });
}

export interface UnreadMessages {
  count: number;
  /** Time of the oldest unread message; everything from then on is new */
  since: number;
}

/** Unread organizer messages of the current user per bazaar, for the bazaar cards. */
export const getMyUnreadMessages = query({
  args: {},
  handler: async (ctx): Promise<Record<Id<'events'>, UnreadMessages>> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return {};
    const notices = await ctx.db
      .query('unreadNotices')
      .withIndex('by_user_area', (q) => q.eq('userId', userId).eq('area', 'messages'))
      .collect();
    const unread: Record<Id<'events'>, UnreadMessages> = {};
    for (const notice of notices) {
      if (!notice.eventId) continue;
      const current = unread[notice.eventId];
      unread[notice.eventId] = {
        count: (current?.count ?? 0) + 1,
        since: Math.min(current?.since ?? Infinity, notice.createdAt),
      };
    }
    return unread;
  },
});

interface BroadcastView extends Pick<
  Doc<'eventBroadcasts'>,
  '_id' | 'subject' | 'body' | 'important' | 'createdAt'
> {
  /** Only for the organizer team */
  audience?: BroadcastAudience;
  recipientCount?: number;
}

/**
 * Messages of the bazaar, newest first: the organizer team sees all with recipient
 * count and audience, a seller only the ones sent to them.
 */
export const listEventBroadcasts = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, { eventId }): Promise<BroadcastView[]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const broadcasts = await ctx.db
      .query('eventBroadcasts')
      .withIndex('by_event', (q) => q.eq('eventId', eventId))
      .order('desc')
      .take(50);
    const view = (broadcast: Doc<'eventBroadcasts'>): BroadcastView => ({
      _id: broadcast._id,
      subject: broadcast.subject,
      body: broadcast.body,
      important: broadcast.important,
      createdAt: broadcast.createdAt,
    });
    if (await hasAnyEventRoleOrAdmin(ctx, eventId, userId, ['organizer', 'coorganizer'])) {
      return broadcasts.map((broadcast) => ({
        ...view(broadcast),
        audience: broadcast.audience,
        recipientCount: broadcast.recipientIds.length,
      }));
    }
    if (!(await hasEventRole(ctx, eventId, userId, 'seller'))) return [];
    return broadcasts.filter((broadcast) => broadcast.recipientIds.includes(userId)).map(view);
  },
});
