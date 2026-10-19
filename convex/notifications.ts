import { ConvexError, v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import type { Doc, Id } from './_generated/dataModel';
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import { internal } from './_generated/api';
import {
  NOTICE_AREAS,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABELS,
  type NoticeArea,
  type NotificationCategory,
} from './constants';
import { notificationPrefsValidator } from './schema';

export interface NotificationContent {
  subject: string;
  heading: string;
  paragraphs: string[];
  details?: { label: string; value: string }[];
  link?: { label: string; path: string };
  footnote?: string;
  /** Kind of email the user can switch off; without, the email is always sent */
  category?: NotificationCategory;
}

/** Whether the user wants emails of this category; everything is on until switched off. */
export function wantsEmail(user: Doc<'users'>, category: NotificationCategory | undefined) {
  return !category || user.notificationPrefs?.[category] !== false;
}

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Path of the one-click unsubscribe endpoint (RFC 8058), served by convex/http.ts. */
export const ONE_CLICK_UNSUBSCRIBE_PATH = '/unsubscribe';

export interface UnsubscribeLinks {
  /** Page in the app, relative to SITE_URL */
  path: string;
  /** POST target for the List-Unsubscribe header, relative to CONVEX_SITE_URL */
  oneClickPath: string;
  /** Title of the category, for the mail footer */
  category: string;
}

/** Links to switch the category off without logging in (walk-in sellers cannot log in). */
async function unsubscribeLinks(
  ctx: MutationCtx,
  user: Doc<'users'>,
  category: NotificationCategory
): Promise<UnsubscribeLinks> {
  let token = user.unsubscribeToken;
  if (!token) {
    token = randomToken();
    await ctx.db.patch(user._id, { unsubscribeToken: token });
  }
  const query = `?t=${token}&k=${category}`;
  return {
    path: `/benachrichtigungen/abbestellen${query}`,
    oneClickPath: `${ONE_CLICK_UNSUBSCRIBE_PATH}${query}`,
    category: NOTIFICATION_CATEGORY_LABELS[category].title,
  };
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
  area?: NoticeArea,
  /** Spreads many mails over time so the SMTP server does not throttle */
  delayMs = 0
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
  if (!to || !user || !wantsEmail(user, content.category)) return;
  const unsubscribe = content.category
    ? await unsubscribeLinks(ctx, user, content.category)
    : undefined;
  await notifyAddress(ctx, to, content, unsubscribe, delayMs);
}

/** Email to a plain address, e.g. a receipt for a buyer without account. */
export async function notifyAddress(
  ctx: MutationCtx,
  to: string,
  content: NotificationContent,
  unsubscribe?: UnsubscribeLinks,
  delayMs = 0
) {
  // The category only decides whether to send; the mail itself does not need it
  const mail = { ...content };
  delete mail.category;
  await ctx.scheduler.runAfter(delayMs, internal.mail.sendNotification, {
    to,
    ...mail,
    unsubscribe,
  });
}

const noticeArea = v.union(...NOTICE_AREAS.map(v.literal));

/** Unread notifications of the current user per menu entry. */
export const getUnreadNoticeCounts = query({
  args: {},
  handler: async (ctx) => {
    const counts: Record<NoticeArea, number> = { products: 0, sales: 0, messages: 0, events: 0 };
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

/** The user opened the page of `area` (or of one bazaar): its marker goes away. */
export const markNoticesSeen = mutation({
  args: { area: noticeArea, eventId: v.optional(v.id('events')) },
  handler: async (ctx, { area, eventId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;
    const notices = await ctx.db
      .query('unreadNotices')
      .withIndex('by_user_area', (q) => q.eq('userId', userId).eq('area', area))
      .collect();
    for (const notice of notices) {
      if (eventId && notice.eventId !== eventId) continue;
      await ctx.db.delete(notice._id);
    }
  },
});

/** The current user's email settings, one switch per category. */
export const getMyNotificationPrefs = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const user = userId ? await ctx.db.get(userId) : null;
    if (!user) return null;
    return Object.fromEntries(
      NOTIFICATION_CATEGORIES.map((category) => [category, wantsEmail(user, category)])
    ) as Record<NotificationCategory, boolean>;
  },
});

export const updateMyNotificationPrefs = mutation({
  args: { prefs: notificationPrefsValidator },
  handler: async (ctx, { prefs }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    const user = await ctx.db.get(userId);
    if (!user) throw new Error('Not authenticated');
    await ctx.db.patch(userId, { notificationPrefs: { ...user.notificationPrefs, ...prefs } });
  },
});

const categoryArg = v.union(...NOTIFICATION_CATEGORIES.map(v.literal));

/** For the unsubscribe page: which category the link is about; null for unknown tokens. */
export const getUnsubscribeInfo = query({
  args: { token: v.string(), category: categoryArg },
  handler: async (ctx, { token, category }) => {
    const user = await findByUnsubscribeToken(ctx, token);
    if (!user) return null;
    return {
      category: NOTIFICATION_CATEGORY_LABELS[category].title,
      subscribed: wantsEmail(user, category),
      // Walk-in sellers have no login, so the account settings are no help to them
      canLogIn: user.managedByEventId === undefined,
    };
  },
});

/** Switches one category off; false for unknown tokens. */
async function unsubscribeByToken(
  ctx: MutationCtx,
  token: string,
  category: NotificationCategory
): Promise<boolean> {
  const user = await findByUnsubscribeToken(ctx, token);
  if (!user) return false;
  await ctx.db.patch(user._id, {
    notificationPrefs: { ...user.notificationPrefs, [category]: false },
  });
  return true;
}

/** Switches one category off from the link in an email, without login. */
export const unsubscribe = mutation({
  args: { token: v.string(), category: categoryArg },
  handler: async (ctx, { token, category }) => {
    if (!(await unsubscribeByToken(ctx, token, category))) {
      throw new ConvexError('Dieser Abmeldelink ist ungültig.');
    }
  },
});

/** One-click unsubscribe from the mail client (List-Unsubscribe-Post), see convex/http.ts. */
export const unsubscribeOneClick = internalMutation({
  args: { token: v.string(), category: v.string() },
  handler: async (ctx, { token, category }) => {
    if (!(NOTIFICATION_CATEGORIES as readonly string[]).includes(category)) return false;
    return await unsubscribeByToken(ctx, token, category as NotificationCategory);
  },
});

async function findByUnsubscribeToken(ctx: QueryCtx, token: string) {
  // Tokens are 32 hex characters; anything else cannot match
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  return await ctx.db
    .query('users')
    .withIndex('by_unsubscribeToken', (q) => q.eq('unsubscribeToken', token))
    .unique();
}
