import { getAuthUserId } from '@convex-dev/auth/server';
import type { Doc, Id } from './_generated/dataModel';
import type { DatabaseReader, MutationCtx, QueryCtx } from './_generated/server';

/**
 * Platform administrators moderate all user content and may act as organizer of
 * every event. All admin checks go through these two helpers.
 */
export async function isPlatformAdmin(
  ctx: { db: DatabaseReader },
  userId: Id<'users'> | null
): Promise<boolean> {
  if (!userId) return false;
  const user = await ctx.db.get(userId);
  return user?.systemRole === 'admin' && user.status !== 'banned' && user.status !== 'deleted';
}

/** Active administrators, e.g. as recipients of moderation and approval emails. */
export async function listActiveAdmins(ctx: { db: DatabaseReader }): Promise<Doc<'users'>[]> {
  const admins = await ctx.db
    .query('users')
    .withIndex('by_systemRole', (q) => q.eq('systemRole', 'admin'))
    .collect();
  return admins.filter((admin) => admin.status !== 'banned' && admin.status !== 'deleted');
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx): Promise<Id<'users'>> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error('Not authenticated');
  }
  if (!(await isPlatformAdmin(ctx, userId))) {
    throw new Error('Not authorized');
  }
  return userId;
}
