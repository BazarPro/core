import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { internal } from './_generated/api';

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

/** Schedules an email to a user; silently skipped if the user has no address. */
export async function notifyUser(
  ctx: MutationCtx,
  userId: Id<'users'>,
  content: NotificationContent
) {
  const to = notificationAddress(await ctx.db.get(userId));
  if (!to) return;
  await notifyAddress(ctx, to, content);
}

export async function notifyAddress(ctx: MutationCtx, to: string, content: NotificationContent) {
  await ctx.scheduler.runAfter(0, internal.mail.sendNotification, { to, ...content });
}
