import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx } from './_generated/server';
import { internal } from './_generated/api';
import { NOTICE_AREAS, type NoticeArea } from './constants';

export interface NotificationContent {
  subject: string;
  heading: string;
  paragraphs: string[];
  details?: { label: string; value: string }[];
  link?: { label: string; path: string };
  footnote?: string;
}

/** Where notifications for a user go: login email, or the contact email of a walk-in seller. */
export function notificationAddress(user: Doc<'users'> | null): string | undefined {
  if (!user || user.status === 'deleted' || user.status === 'banned') return undefined;
  return user.email ?? user.contactEmail ?? undefined;
}

export function displayName(user: Doc<'users'> | null): string {
  if (!user) return 'Unbekannt';
  return user.firstName || user.name?.split(' ')[0] || 'Jemand';
}

export function formatEuro(amount: number): string {
  return `${amount.toFixed(2).replace('.', ',')} €`;
}

/**
 * Schedules an email to a user; silently skipped if the user has no address. With
 * `area`, the matching menu entry also shows a red marker until the user opens it.
 */
export async function notifyUser(
  ctx: MutationCtx,
  userId: Id<'users'>,
  content: NotificationContent,
  area?: NoticeArea
) {
  const user = await ctx.db.get(userId);
  // Walk-in sellers cannot log in, so they never see a marker
  if (
    area &&
    user &&
    user.status !== 'deleted' &&
    user.status !== 'banned' &&
    !user.managedByEventId
  ) {
    await ctx.db.insert('unreadNotices', { userId, area, createdAt: Date.now() });
  }
  const to = notificationAddress(user);
  if (!to) return;
  await notifyAddress(ctx, to, content);
}

export async function notifyAddress(ctx: MutationCtx, to: string, content: NotificationContent) {
  await ctx.scheduler.runAfter(0, internal.mail.sendNotification, { to, ...content });
}

const noticeArea = v.union(...NOTICE_AREAS.map(v.literal));

/** Unread notifications of the current user per menu entry. */
export const getUnreadNoticeCounts = query({
  args: {},
  handler: async (ctx) => {
    const counts: Record<NoticeArea, number> = { products: 0, sales: 0, events: 0 };
    const userId = await getAuthUserId(ctx);
    if (!userId) return counts;
    for (const area of NOTICE_AREAS) {
      const notices = await ctx.db
        .query('unreadNotices')
        .withIndex('by_user_area', (q) => q.eq('userId', userId).eq('area', area))
        .collect();
      counts[area] = notices.length;
    }
    return counts;
  },
});

/** The user opened the page of `area`: its marker goes away. */
export const markNoticesSeen = mutation({
  args: { area: noticeArea },
  handler: async (ctx, { area }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;
    const notices = await ctx.db
      .query('unreadNotices')
      .withIndex('by_user_area', (q) => q.eq('userId', userId).eq('area', area))
      .collect();
    for (const notice of notices) await ctx.db.delete(notice._id);
  },
});
