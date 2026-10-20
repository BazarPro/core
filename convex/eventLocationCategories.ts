import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { hasAnyEventRoleOrAdmin } from './eventRoles';
import { appError } from './errors';

export const listForEvent = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, { eventId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw appError('auth.required');
    if (!(await hasAnyEventRoleOrAdmin(ctx, eventId, userId, ['organizer', 'coorganizer']))) {
      throw appError('auth.forbidden');
    }

    const rows = await ctx.db
      .query('eventLocationCategories')
      .withIndex('by_eventId', (q) => q.eq('eventId', eventId))
      .collect();

    return rows.sort((a, b) => a._creationTime - b._creationTime);
  },
});

export const createCategory = mutation({
  args: {
    eventId: v.id('events'),
    label: v.string(),
  },
  handler: async (ctx, { eventId, label }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw appError('auth.required');
    if (!(await hasAnyEventRoleOrAdmin(ctx, eventId, userId, ['organizer', 'coorganizer']))) {
      throw appError('auth.forbidden');
    }

    const trimmed = label.trim();
    if (!trimmed) {
      throw appError('event.labelEmpty');
    }

    return await ctx.db.insert('eventLocationCategories', {
      eventId,
      label: trimmed,
    });
  },
});

export const updateCategoryLabel = mutation({
  args: {
    categoryId: v.id('eventLocationCategories'),
    label: v.string(),
  },
  handler: async (ctx, { categoryId, label }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw appError('auth.required');

    const row = await ctx.db.get(categoryId);
    if (!row) throw appError('notFound.category');

    if (!(await hasAnyEventRoleOrAdmin(ctx, row.eventId, userId, ['organizer', 'coorganizer']))) {
      throw appError('auth.forbidden');
    }

    const trimmed = label.trim();
    if (!trimmed) {
      throw appError('event.labelEmpty');
    }

    await ctx.db.patch(categoryId, { label: trimmed });
  },
});

export const deleteCategory = mutation({
  args: {
    categoryId: v.id('eventLocationCategories'),
  },
  handler: async (ctx, { categoryId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw appError('auth.required');

    const row = await ctx.db.get(categoryId);
    if (!row) throw appError('notFound.category');

    if (!(await hasAnyEventRoleOrAdmin(ctx, row.eventId, userId, ['organizer', 'coorganizer']))) {
      throw appError('auth.forbidden');
    }

    const relations = await ctx.db
      .query('eventProducts')
      .withIndex('by_eventId', (q) => q.eq('eventId', row.eventId))
      .collect();

    for (const ep of relations) {
      if (ep.locationCategoryId === categoryId) {
        await ctx.db.patch(ep._id, { locationCategoryId: undefined });
      }
    }

    await ctx.db.delete(categoryId);
  },
});
