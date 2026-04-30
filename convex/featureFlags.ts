import { v } from 'convex/values';
import { internalMutation, query } from './_generated/server';

/**
 * Gets feature flags, either all flags or a specific flag by key
 * @param args.key - Optional key to get a specific flag
 * @returns Promise<Record<string, boolean>> - Object with flag keys and their boolean values
 */
export const get = query({
  args: { key: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.key) {
      const flag = await ctx.db
        .query('featureFlags')
        .withIndex('by_key', (q) => q.eq('key', args.key!))
        .unique();
      return flag ? { [flag.key]: flag.value } : {};
    }
    const flags = await ctx.db.query('featureFlags').collect();
    return flags.reduce(
      (acc, flag) => ({
        ...acc,
        [flag.key]: flag.value,
      }),
      {} as Record<string, boolean>
    );
  },
});

/**
 * Sets or updates a feature flag (internal use only)
 * @param args.key - Key of the flag
 * @param args.value - Boolean value of the flag
 * @param args.description - Optional description of the flag
 */
export const set = internalMutation({
  args: {
    key: v.string(),
    value: v.boolean(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('featureFlags')
      .withIndex('by_key', (q) => q.eq('key', args.key))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        description: args.description,
      });
    } else {
      await ctx.db.insert('featureFlags', {
        key: args.key,
        value: args.value,
        description: args.description,
      });
    }
  },
});
