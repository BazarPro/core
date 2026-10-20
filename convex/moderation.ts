import { ConvexError, v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { isPlatformAdmin, listActiveAdmins, requireAdmin } from './adminAuth';
import { getBrandName } from './instance';
import {
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_TARGETS,
  type ModerationAction,
  type ReportTarget,
} from './constants';
import { EMAIL_PATTERN } from './constants';
import { displayName, notifyAddress, notifyUser, type LocalizedContent } from './notifications';
import { revokeUserSessions } from './users';

/**
 * Moderation of user content by platform administrators: reports from users (notice and
 * action), hiding items and events with a stated reason, deleting questions, banning
 * accounts, the contact inbox and a log of every admin decision.
 */

const MIN_DETAILS_LENGTH = 10;
const MAX_DETAILS_LENGTH = 2000;
const MAX_REASON_LENGTH = 1000;
/** Keeps a single account from flooding the admins with reports. */
const MAX_OPEN_REPORTS_PER_REPORTER = 20;
const HOUR = 60 * 60 * 1000;
/**
 * Reports without login are only limited by the email address typed in, which costs
 * nothing to change. These caps keep a script from flooding the queue and the admins.
 */
const MAX_ANONYMOUS_REPORTS_PER_HOUR = 30;
const MAX_OPEN_REPORTS_PER_TARGET = 10;
/** Beyond this, new reports only show up in the admin badge, without an email. */
const MAX_REPORT_MAILS_PER_HOUR = 10;
const LIST_LIMIT = 200;
/** Text search in admin lists has no search index: it reads at most this many, newest first. */
const MAX_SEARCH_SCAN = 5000;

/** Newest documents matching a filter, without reading the whole table. */
async function takeMatching<T>(
  source: AsyncIterable<T>,
  matches: (doc: T) => boolean,
  limit = LIST_LIMIT
): Promise<T[]> {
  const result: T[] = [];
  let scanned = 0;
  for await (const doc of source) {
    if (matches(doc)) {
      result.push(doc);
      if (result.length >= limit) break;
    }
    if (++scanned >= MAX_SEARCH_SCAN) break;
  }
  return result;
}

function countUnhandledMessages(ctx: QueryCtx) {
  return ctx.db
    .query('messages')
    .withIndex('by_handledAt', (q) => q.eq('handledAt', undefined))
    .collect()
    .then((messages) => messages.length);
}

const REASON_LABELS: Record<(typeof REPORT_REASONS)[number], string> = {
  illegal: 'Rechtswidriger Inhalt',
  fraud: 'Betrug oder Fälschung',
  offensive: 'Beleidigend oder diskriminierend',
  personalData: 'Persönliche Daten ohne Einwilligung',
  spam: 'Spam oder Werbung',
  other: 'Sonstiges',
};

type Ctx = QueryCtx | MutationCtx;

interface TargetInfo {
  label: string;
  /** App path to look at the content */
  path?: string;
  /** Account responsible for the content, notified about decisions */
  ownerId?: Id<'users'>;
  ownerName?: string;
  /** Hidden by moderation, deleted or banned */
  isRestricted: boolean;
  exists: boolean;
}

async function describeTarget(ctx: Ctx, type: ReportTarget, id: string): Promise<TargetInfo> {
  const missing: TargetInfo = { label: 'Gelöschter Inhalt', isRestricted: true, exists: false };
  if (type === 'product') {
    const productId = ctx.db.normalizeId('products', id);
    const product = productId ? await ctx.db.get(productId) : null;
    if (!product) return missing;
    const owner = await ctx.db.get(product.vendorId);
    return {
      label: product.title,
      path: `/products/view/${product._id}`,
      ownerId: product.vendorId,
      ownerName: owner?.name ?? owner?.email ?? undefined,
      isRestricted: !!product.moderation,
      exists: true,
    };
  }
  if (type === 'event') {
    const eventId = ctx.db.normalizeId('events', id);
    const event = eventId ? await ctx.db.get(eventId) : null;
    if (!event) return missing;
    const owner = await ctx.db.get(event.organizerId);
    return {
      label: event.title,
      path: `/events/view/${event._id}`,
      ownerId: event.organizerId,
      ownerName: owner?.name ?? owner?.email ?? undefined,
      isRestricted: !!event.moderation,
      exists: true,
    };
  }
  if (type === 'question') {
    const questionId = ctx.db.normalizeId('productQuestions', id);
    const question = questionId ? await ctx.db.get(questionId) : null;
    if (!question) return missing;
    const asker = await ctx.db.get(question.askerId);
    return {
      label: `„${question.question}“`,
      path: `/products/view/${question.productId}`,
      ownerId: question.askerId,
      ownerName: asker?.name ?? asker?.email ?? undefined,
      isRestricted: false,
      exists: true,
    };
  }
  const userId = ctx.db.normalizeId('users', id);
  const user = userId ? await ctx.db.get(userId) : null;
  if (!user) return missing;
  return {
    label: user.name ?? user.email ?? 'Unbekannt',
    ownerId: user._id,
    ownerName: user.name ?? user.email ?? undefined,
    isRestricted: user.status === 'banned',
    exists: true,
  };
}

async function logAction(
  ctx: MutationCtx,
  entry: {
    adminId: Id<'users'>;
    action: ModerationAction;
    targetType: ReportTarget;
    targetId: string;
    targetLabel: string;
    reason?: string;
    reportId?: Id<'reports'>;
  }
) {
  await ctx.db.insert('moderationLog', { ...entry, createdAt: Date.now() });
}

function requireReason(reason: string): string {
  const text = reason.trim();
  if (text.length < 5) {
    throw new ConvexError(
      'Bitte gib eine Begründung an. Sie wird der betroffenen Person mitgeteilt.'
    );
  }
  return text.slice(0, MAX_REASON_LENGTH);
}

/** Closes the report that led to a decision and tells the reporter about the outcome. */
async function closeReport(
  ctx: MutationCtx,
  adminId: Id<'users'>,
  reportId: Id<'reports'> | undefined,
  status: 'resolved' | 'dismissed',
  note: string | undefined
) {
  if (!reportId) return;
  const report = await ctx.db.get(reportId);
  if (!report || report.status !== 'open') return;
  await ctx.db.patch(reportId, {
    status,
    resolvedAt: Date.now(),
    resolvedBy: adminId,
    resolutionNote: note,
  });
  const target = await describeTarget(ctx, report.targetType, report.targetId);
  const content: LocalizedContent = (t) => ({
    subject: t('report.closed.subject'),
    heading: t('report.closed.heading'),
    paragraphs: [
      status === 'resolved' ? t('report.closed.resolved') : t('report.closed.dismissed'),
      ...(note ? [t('moderation.reason', { reason: note })] : []),
    ],
    details: [{ label: t('report.closed.target'), value: target.label }],
  });
  if (report.reporterId) {
    await notifyUser(ctx, report.reporterId, content);
  } else if (report.reporterEmail) {
    await notifyAddress(ctx, report.reporterEmail, content);
  }
}

/** Closes all other open reports about the same content after a decision. */
async function closeReportsForTarget(
  ctx: MutationCtx,
  adminId: Id<'users'>,
  targetType: ReportTarget,
  targetId: string,
  status: 'resolved' | 'dismissed',
  note: string | undefined
) {
  const reports = await ctx.db
    .query('reports')
    .withIndex('by_target', (q) => q.eq('targetType', targetType).eq('targetId', targetId))
    .collect();
  for (const report of reports) {
    if (report.status === 'open') {
      await closeReport(ctx, adminId, report._id, status, note);
    }
  }
}

async function notifyAdminsAboutReport(ctx: MutationCtx, label: string, reason: string) {
  const admins = await listActiveAdmins(ctx);
  const brand = await getBrandName(ctx);
  for (const admin of admins) {
    await notifyUser(ctx, admin._id, (t) => ({
      subject: t('report.new.subject', { label }),
      heading: t('report.new.heading'),
      paragraphs: [t('report.new.text', { brand })],
      details: [
        { label: t('report.new.content'), value: label },
        { label: t('report.new.reason'), value: reason },
      ],
      link: { label: t('report.new.link'), path: '/admin/reports' },
      footnote: t('report.new.footnote', { brand }),
    }));
  }
}

// ---------------------------------------------------------------------------
// Reports from users

/**
 * Reports content to the administrators. Logged-in users report with their account,
 * everybody else leaves an email address so we can tell them the outcome.
 */
export const reportContent = mutation({
  args: {
    targetType: v.union(...REPORT_TARGETS.map(v.literal)),
    targetId: v.string(),
    reason: v.union(...REPORT_REASONS.map(v.literal)),
    details: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const email = args.email?.trim();
    if (!userId && (!email || !EMAIL_PATTERN.test(email))) {
      throw new ConvexError('Bitte gib deine E-Mail-Adresse an, damit wir dir antworten können.');
    }

    const details = args.details.trim();
    if (details.length < MIN_DETAILS_LENGTH) {
      throw new ConvexError('Bitte beschreibe kurz, was an dem Inhalt nicht in Ordnung ist.');
    }
    if (details.length > MAX_DETAILS_LENGTH) {
      throw new ConvexError(`Die Beschreibung darf höchstens ${MAX_DETAILS_LENGTH} Zeichen haben.`);
    }

    const target = await describeTarget(ctx, args.targetType, args.targetId);
    if (!target.exists) throw new ConvexError('Der Inhalt existiert nicht mehr.');

    const now = Date.now();
    const lastHour = await ctx.db
      .query('reports')
      .withIndex('by_createdAt', (q) => q.gte('createdAt', now - HOUR))
      .collect();
    if (!userId && lastHour.filter((r) => !r.reporterId).length >= MAX_ANONYMOUS_REPORTS_PER_HOUR) {
      throw new ConvexError(
        'Gerade gehen sehr viele Meldungen ein. Bitte melde dich an oder versuche es später erneut.'
      );
    }
    const openForTarget = (
      await ctx.db
        .query('reports')
        .withIndex('by_target', (q) =>
          q.eq('targetType', args.targetType).eq('targetId', args.targetId)
        )
        .collect()
    ).filter((r) => r.status === 'open');
    if (openForTarget.length >= MAX_OPEN_REPORTS_PER_TARGET) {
      throw new ConvexError('Dieser Inhalt wurde bereits gemeldet. Wir kümmern uns darum.');
    }

    const openReports = await ctx.db
      .query('reports')
      .withIndex('by_status', (q) => q.eq('status', 'open'))
      .collect();
    const mine = openReports.filter((r) =>
      userId ? r.reporterId === userId : r.reporterEmail === email
    );
    if (mine.some((r) => r.targetType === args.targetType && r.targetId === args.targetId)) {
      throw new ConvexError('Du hast diesen Inhalt bereits gemeldet. Wir kümmern uns darum.');
    }
    if (mine.length >= MAX_OPEN_REPORTS_PER_REPORTER) {
      throw new ConvexError(
        'Du hast schon viele offene Meldungen. Bitte warte, bis wir sie geprüft haben.'
      );
    }

    await ctx.db.insert('reports', {
      targetType: args.targetType,
      targetId: args.targetId,
      reason: args.reason,
      details,
      reporterId: userId ?? undefined,
      reporterEmail: userId ? undefined : email,
      status: 'open',
      createdAt: now,
    });
    // Further reports about the same content and floods only raise the badge count
    if (openForTarget.length === 0 && lastHour.length < MAX_REPORT_MAILS_PER_HOUR) {
      await notifyAdminsAboutReport(ctx, target.label, REASON_LABELS[args.reason]);
    }
  },
});

// ---------------------------------------------------------------------------
// Admin overview

export const getOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    // Counters with an index read only the matching documents; the totals of users and
    // items come from platformStats, which refreshPlatformStats counts every hour.
    const [
      openReports,
      pendingEvents,
      currentEvents,
      hiddenEvents,
      unhandledMessages,
      newUsers,
      bannedUsers,
      hiddenProducts,
      stats,
    ] = await Promise.all([
      ctx.db
        .query('reports')
        .withIndex('by_status', (q) => q.eq('status', 'open'))
        .collect(),
      ctx.db
        .query('events')
        .withIndex('by_approvalStatus', (q) => q.eq('approvalStatus', 'pending'))
        .collect(),
      ctx.db
        .query('events')
        .withIndex('by_endDate', (q) => q.gte('endDate', now))
        .collect(),
      ctx.db
        .query('events')
        .withIndex('by_hiddenAt', (q) => q.gte('moderation.hiddenAt', 0))
        .collect(),
      countUnhandledMessages(ctx),
      ctx.db
        .query('users')
        .withIndex('by_creation_time', (q) => q.gte('_creationTime', weekAgo))
        .collect(),
      ctx.db
        .query('users')
        .withIndex('by_status', (q) => q.eq('status', 'banned'))
        .collect(),
      ctx.db
        .query('products')
        .withIndex('by_hiddenAt', (q) => q.gte('moderation.hiddenAt', 0))
        .collect(),
      ctx.db.query('platformStats').first(),
    ]);

    return {
      openReports: openReports.length,
      pendingEvents: pendingEvents.filter((e) => e.visibility === 'public').length,
      unhandledMessages,
      runningEvents: currentEvents.filter((e) => e.startDate <= now).length,
      upcomingEvents: currentEvents.filter((e) => e.startDate > now).length,
      users: stats?.users,
      newUsers: newUsers.filter(isRealUser).length,
      bannedUsers: bannedUsers.filter((u) => !u.managedByEventId).length,
      products: stats?.products,
      statsUpdatedAt: stats?.updatedAt,
      hiddenProducts: hiddenProducts.length,
      hiddenEvents: hiddenEvents.length,
    };
  },
});

/** Accounts of people, not walk-in sellers or deleted accounts. */
function isRealUser(user: Doc<'users'>) {
  return !user.managedByEventId && user.status !== 'deleted';
}

const STATS_BATCH = 1000;

/**
 * Counts users and items for the overview, one batch per run so no transaction reads
 * a whole table. Runs hourly; the result replaces the stored totals at the end.
 */
export const refreshPlatformStats = internalMutation({
  args: {
    table: v.optional(v.union(v.literal('users'), v.literal('products'))),
    cursor: v.optional(v.union(v.string(), v.null())),
    users: v.optional(v.number()),
    products: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const table = args.table ?? 'users';
    let users = args.users ?? 0;
    let products = args.products ?? 0;
    const cursor = args.cursor ?? null;

    let isDone: boolean;
    let continueCursor: string;
    if (table === 'users') {
      const page = await ctx.db.query('users').paginate({ cursor, numItems: STATS_BATCH });
      users += page.page.filter(isRealUser).length;
      ({ isDone, continueCursor } = page);
    } else {
      const page = await ctx.db.query('products').paginate({ cursor, numItems: STATS_BATCH });
      products += page.page.length;
      ({ isDone, continueCursor } = page);
    }

    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.moderation.refreshPlatformStats, {
        table,
        cursor: continueCursor,
        users,
        products,
      });
    } else if (table === 'users') {
      await ctx.scheduler.runAfter(0, internal.moderation.refreshPlatformStats, {
        table: 'products',
        users,
        products,
      });
    } else {
      const stats = { users, products, updatedAt: Date.now() };
      const existing = await ctx.db.query('platformStats').first();
      if (existing) await ctx.db.patch(existing._id, stats);
      else await ctx.db.insert('platformStats', stats);
    }
  },
});

export const listReports = query({
  args: { status: v.union(...REPORT_STATUSES.map(v.literal)) },
  handler: async (ctx, { status }) => {
    await requireAdmin(ctx);
    const reports = await ctx.db
      .query('reports')
      .withIndex('by_status', (q) => q.eq('status', status))
      .order('desc')
      .take(LIST_LIMIT);

    return await Promise.all(
      reports.map(async (report) => {
        const target = await describeTarget(ctx, report.targetType, report.targetId);
        const reporter = report.reporterId ? await ctx.db.get(report.reporterId) : null;
        const resolver = report.resolvedBy ? await ctx.db.get(report.resolvedBy) : null;
        const sameTarget = await ctx.db
          .query('reports')
          .withIndex('by_target', (q) =>
            q.eq('targetType', report.targetType).eq('targetId', report.targetId)
          )
          .collect();
        return {
          ...report,
          target,
          reportCount: sameTarget.length,
          reporterLabel: reporter
            ? (reporter.name ?? reporter.email ?? 'Nutzer')
            : (report.reporterEmail ?? 'Anonym'),
          resolverName: resolver?.name ?? resolver?.email ?? undefined,
        };
      })
    );
  },
});

/** Closes a report without touching the content, e.g. after deciding it is fine. */
export const resolveReport = mutation({
  args: {
    reportId: v.id('reports'),
    status: v.union(v.literal('resolved'), v.literal('dismissed')),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { reportId, status, note }) => {
    const adminId = await requireAdmin(ctx);
    const report = await ctx.db.get(reportId);
    if (!report) throw new ConvexError('Meldung nicht gefunden.');
    if (report.status !== 'open') throw new ConvexError('Die Meldung ist bereits abgeschlossen.');
    const text = note?.trim() || undefined;
    const target = await describeTarget(ctx, report.targetType, report.targetId);
    await closeReport(ctx, adminId, reportId, status, text);
    await logAction(ctx, {
      adminId,
      action: status === 'resolved' ? 'resolveReport' : 'dismissReport',
      targetType: report.targetType,
      targetId: report.targetId,
      targetLabel: target.label,
      reason: text,
      reportId,
    });
  },
});

// ---------------------------------------------------------------------------
// Decisions on content

export const hideProduct = mutation({
  args: { productId: v.id('products'), reason: v.string(), reportId: v.optional(v.id('reports')) },
  handler: async (ctx, { productId, reason, reportId }) => {
    const adminId = await requireAdmin(ctx);
    const product = await ctx.db.get(productId);
    if (!product) throw new ConvexError('Artikel nicht gefunden.');
    const text = requireReason(reason);

    await ctx.db.patch(productId, {
      moderation: { hiddenAt: Date.now(), hiddenBy: adminId, reason: text },
    });
    await logAction(ctx, {
      adminId,
      action: 'hideProduct',
      targetType: 'product',
      targetId: productId,
      targetLabel: product.title,
      reason: text,
      reportId,
    });
    await notifyUser(
      ctx,
      product.vendorId,
      (t) => ({
        subject: t('moderation.productHidden.subject', { title: product.title }),
        heading: t('moderation.productHidden.heading'),
        paragraphs: [
          t('moderation.productHidden.text'),
          t('moderation.reason', { reason: text }),
          t('moderation.appeal'),
        ],
        link: { label: t('moderation.viewProduct'), path: `/products/view/${productId}` },
      }),
      'products'
    );
    await closeReportsForTarget(ctx, adminId, 'product', productId, 'resolved', text);
  },
});

export const restoreProduct = mutation({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const adminId = await requireAdmin(ctx);
    const product = await ctx.db.get(productId);
    if (!product) throw new ConvexError('Artikel nicht gefunden.');
    if (!product.moderation) return;
    await ctx.db.patch(productId, { moderation: undefined });
    await logAction(ctx, {
      adminId,
      action: 'restoreProduct',
      targetType: 'product',
      targetId: productId,
      targetLabel: product.title,
    });
    await notifyUser(
      ctx,
      product.vendorId,
      (t) => ({
        subject: t('moderation.productRestored.subject', { title: product.title }),
        heading: t('moderation.productRestored.heading'),
        paragraphs: [t('moderation.productRestored.text')],
        link: { label: t('moderation.viewProduct'), path: `/products/view/${productId}` },
      }),
      'products'
    );
  },
});

/** Hides an event from everybody except its team; works for every visibility. */
export const hideEvent = mutation({
  args: { eventId: v.id('events'), reason: v.string(), reportId: v.optional(v.id('reports')) },
  handler: async (ctx, { eventId, reason, reportId }) => {
    const adminId = await requireAdmin(ctx);
    const event = await ctx.db.get(eventId);
    if (!event) throw new ConvexError('Veranstaltung nicht gefunden.');
    const text = requireReason(reason);

    await ctx.db.patch(eventId, {
      moderation: { hiddenAt: Date.now(), hiddenBy: adminId, reason: text },
    });
    await logAction(ctx, {
      adminId,
      action: 'hideEvent',
      targetType: 'event',
      targetId: eventId,
      targetLabel: event.title,
      reason: text,
      reportId,
    });
    await notifyUser(
      ctx,
      event.organizerId,
      (t) => ({
        subject: t('moderation.eventHidden.subject', { title: event.title }),
        heading: t('moderation.eventHidden.heading'),
        paragraphs: [
          t('moderation.eventHidden.text'),
          t('moderation.reason', { reason: text }),
          t('moderation.appeal'),
        ],
        link: { label: t('moderation.openEvent'), path: `/events/view/${eventId}` },
      }),
      'events'
    );
    await closeReportsForTarget(ctx, adminId, 'event', eventId, 'resolved', text);
  },
});

export const restoreEvent = mutation({
  args: { eventId: v.id('events') },
  handler: async (ctx, { eventId }) => {
    const adminId = await requireAdmin(ctx);
    const event = await ctx.db.get(eventId);
    if (!event) throw new ConvexError('Veranstaltung nicht gefunden.');
    if (!event.moderation) return;
    await ctx.db.patch(eventId, { moderation: undefined });
    await logAction(ctx, {
      adminId,
      action: 'restoreEvent',
      targetType: 'event',
      targetId: eventId,
      targetLabel: event.title,
    });
    await notifyUser(
      ctx,
      event.organizerId,
      (t) => ({
        subject: t('moderation.eventRestored.subject', { title: event.title }),
        heading: t('moderation.eventRestored.heading'),
        paragraphs: [t('moderation.eventRestored.text')],
        link: { label: t('moderation.openEvent'), path: `/events/view/${eventId}` },
      }),
      'events'
    );
  },
});

export const deleteQuestion = mutation({
  args: {
    questionId: v.id('productQuestions'),
    reason: v.string(),
    reportId: v.optional(v.id('reports')),
  },
  handler: async (ctx, { questionId, reason, reportId }) => {
    const adminId = await requireAdmin(ctx);
    const question = await ctx.db.get(questionId);
    if (!question) throw new ConvexError('Frage nicht gefunden.');
    const text = requireReason(reason);
    const product = await ctx.db.get(question.productId);

    await closeReportsForTarget(ctx, adminId, 'question', questionId, 'resolved', text);
    await ctx.db.delete(questionId);
    await logAction(ctx, {
      adminId,
      action: 'deleteQuestion',
      targetType: 'question',
      targetId: questionId,
      targetLabel: `„${question.question}“${question.answer ? ` / Antwort: „${question.answer}“` : ''}`,
      reason: text,
      reportId,
    });
    await notifyUser(ctx, question.askerId, (t) => ({
      subject: t('moderation.questionDeleted.subject'),
      heading: t('moderation.questionDeleted.heading'),
      paragraphs: [
        product
          ? t('moderation.questionDeleted.textProduct', { title: product.title })
          : t('moderation.questionDeleted.text'),
        t('moderation.reason', { reason: text }),
      ],
      details: [{ label: t('moderation.questionDeleted.question'), value: question.question }],
    }));
  },
});

export const banUser = mutation({
  args: { userId: v.id('users'), reason: v.string(), reportId: v.optional(v.id('reports')) },
  handler: async (ctx, { userId, reason, reportId }) => {
    const adminId = await requireAdmin(ctx);
    if (adminId === userId) throw new ConvexError('Du kannst dich nicht selbst sperren.');
    const user = await ctx.db.get(userId);
    if (!user) throw new ConvexError('Nutzer nicht gefunden.');
    if (user.systemRole === 'admin') {
      throw new ConvexError('Administratoren können nicht gesperrt werden.');
    }
    const text = requireReason(reason);

    // Tell the user before the ban, notifyUser skips banned accounts
    const brand = await getBrandName(ctx);
    await notifyUser(ctx, userId, (t) => ({
      subject: t('moderation.banned.subject', { brand }),
      heading: t('moderation.banned.heading'),
      paragraphs: [
        t('moderation.banned.text'),
        t('moderation.reason', { reason: text }),
        t('moderation.banned.appeal'),
      ],
    }));
    await ctx.db.patch(userId, { status: 'banned' });
    await revokeUserSessions(ctx, userId);
    await logAction(ctx, {
      adminId,
      action: 'banUser',
      targetType: 'user',
      targetId: userId,
      targetLabel: user.name ?? user.email ?? 'Unbekannt',
      reason: text,
      reportId,
    });
    await closeReportsForTarget(ctx, adminId, 'user', userId, 'resolved', text);
  },
});

export const unbanUser = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const adminId = await requireAdmin(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new ConvexError('Nutzer nicht gefunden.');
    if (user.status !== 'banned') return;
    await ctx.db.patch(userId, { status: 'active' });
    await logAction(ctx, {
      adminId,
      action: 'unbanUser',
      targetType: 'user',
      targetId: userId,
      targetLabel: user.name ?? user.email ?? 'Unbekannt',
    });
  },
});

/** Records approvals and rejections of public events in the log. */
export async function logEventReview(
  ctx: MutationCtx,
  adminId: Id<'users'>,
  event: Doc<'events'>,
  action: 'approveEvent' | 'rejectEvent',
  reason?: string
) {
  await logAction(ctx, {
    adminId,
    action,
    targetType: 'event',
    targetId: event._id,
    targetLabel: event.title,
    reason,
  });
}

// ---------------------------------------------------------------------------
// Browsing content

/** Latest items, optionally filtered by text, seller or moderation state. */
export const listProducts = query({
  args: {
    search: v.optional(v.string()),
    vendorId: v.optional(v.id('users')),
    onlyHidden: v.optional(v.boolean()),
  },
  handler: async (ctx, { search, vendorId, onlyHidden }) => {
    await requireAdmin(ctx);
    const term = search?.trim().toLowerCase();
    const source = vendorId
      ? ctx.db.query('products').withIndex('by_vendorId', (q) => q.eq('vendorId', vendorId))
      : onlyHidden
        ? ctx.db.query('products').withIndex('by_hiddenAt', (q) => q.gte('moderation.hiddenAt', 0))
        : ctx.db.query('products');

    const matches = await takeMatching(
      source.order('desc'),
      (p) =>
        (!onlyHidden || !!p.moderation) &&
        (!term ||
          p.title.toLowerCase().includes(term) ||
          p.description.toLowerCase().includes(term) ||
          p._id === term)
    );

    return await Promise.all(
      matches.map(async (product) => {
        const vendor = await ctx.db.get(product.vendorId);
        return {
          _id: product._id,
          _creationTime: product._creationTime,
          title: product.title,
          description: product.description,
          price: product.price,
          sold: product.sold,
          moderation: product.moderation,
          imageUrl: product.images[0] ? await ctx.storage.getUrl(product.images[0]) : null,
          vendorId: product.vendorId,
          vendorName: vendor?.name ?? vendor?.email ?? 'Unbekannt',
        };
      })
    );
  },
});

/** Latest public questions and answers. */
export const listQuestions = query({
  args: { search: v.optional(v.string()), askerId: v.optional(v.id('users')) },
  handler: async (ctx, { search, askerId }) => {
    await requireAdmin(ctx);
    const term = search?.trim().toLowerCase();
    const source = askerId
      ? ctx.db.query('productQuestions').withIndex('by_asker', (q) => q.eq('askerId', askerId))
      : ctx.db.query('productQuestions');
    const matches = await takeMatching(
      source.order('desc'),
      (q) =>
        !term ||
        q.question.toLowerCase().includes(term) ||
        (q.answer ?? '').toLowerCase().includes(term)
    );

    return await Promise.all(
      matches.map(async (question) => {
        const product = await ctx.db.get(question.productId);
        const asker = await ctx.db.get(question.askerId);
        return {
          ...question,
          productTitle: product?.title ?? 'Gelöschter Artikel',
          askerName: asker?.name ?? asker?.email ?? displayName(asker),
        };
      })
    );
  },
});

/** Everything an account has created, for the user detail view. */
export const getUserSummary = query({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const [products, events, questions, roles, reportsAbout, log] = await Promise.all([
      ctx.db
        .query('products')
        .withIndex('by_vendorId', (q) => q.eq('vendorId', userId))
        .collect(),
      ctx.db
        .query('events')
        .withIndex('by_organizerId', (q) => q.eq('organizerId', userId))
        .collect(),
      ctx.db
        .query('productQuestions')
        .withIndex('by_asker', (q) => q.eq('askerId', userId))
        .collect(),
      ctx.db
        .query('eventRole')
        .withIndex('by_user_role', (q) => q.eq('user', userId))
        .collect(),
      ctx.db
        .query('reports')
        .withIndex('by_target', (q) => q.eq('targetType', 'user').eq('targetId', userId))
        .collect(),
      ctx.db
        .query('moderationLog')
        .withIndex('by_target', (q) => q.eq('targetType', 'user').eq('targetId', userId))
        .collect(),
    ]);
    return {
      _id: user._id,
      name: user.name,
      email: user.email ?? user.contactEmail,
      phone: user.phone,
      status: user.status ?? 'active',
      systemRole: user.systemRole,
      createdAt: user._creationTime,
      lastLoginAt: user.lastLoginAt,
      isWalkIn: !!user.managedByEventId,
      productCount: products.length,
      hiddenProductCount: products.filter((p) => !!p.moderation).length,
      events: events.map((e) => ({ _id: e._id, title: e.title, hidden: !!e.moderation })),
      questionCount: questions.length,
      sellerEventCount: roles.filter((r) => r.roles === 'seller').length,
      reportCount: reportsAbout.length,
      history: log.sort((a, b) => b.createdAt - a.createdAt),
    };
  },
});

// ---------------------------------------------------------------------------
// Contact inbox and log

export const listMessages = query({
  args: { handled: v.boolean() },
  handler: async (ctx, { handled }) => {
    await requireAdmin(ctx);
    if (!handled) {
      return await ctx.db
        .query('messages')
        .withIndex('by_handledAt', (q) => q.eq('handledAt', undefined))
        .order('desc')
        .take(LIST_LIMIT);
    }
    // Handled messages: most recently handled first
    return await ctx.db
      .query('messages')
      .withIndex('by_handledAt', (q) => q.gte('handledAt', 0))
      .order('desc')
      .take(LIST_LIMIT);
  },
});

export const setMessageHandled = mutation({
  args: { messageId: v.id('messages'), handled: v.boolean() },
  handler: async (ctx, { messageId, handled }) => {
    const adminId = await requireAdmin(ctx);
    await ctx.db.patch(messageId, {
      handledAt: handled ? Date.now() : undefined,
      handledBy: handled ? adminId : undefined,
    });
  },
});

export const listLog = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const entries = await ctx.db.query('moderationLog').order('desc').take(LIST_LIMIT);
    return await Promise.all(
      entries.map(async (entry) => {
        const admin = await ctx.db.get(entry.adminId);
        return { ...entry, adminName: admin?.name ?? admin?.email ?? 'Admin' };
      })
    );
  },
});

/** Whether the viewer is an admin; used to show moderation tools on public pages. */
export const isViewerAdmin = query({
  args: {},
  handler: async (ctx) => isPlatformAdmin(ctx, await getAuthUserId(ctx)),
});

/** Small counters for the admin menu. */
export const getMenuCounts = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPlatformAdmin(ctx, await getAuthUserId(ctx)))) return null;
    const openReports = await ctx.db
      .query('reports')
      .withIndex('by_status', (q) => q.eq('status', 'open'))
      .collect();
    return {
      openReports: openReports.length,
      unhandledMessages: await countUnhandledMessages(ctx),
    };
  },
});
