import { getAuthUserId } from '@convex-dev/auth/server';
import type { Id } from './_generated/dataModel';
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
