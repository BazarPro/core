import { v } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import { getAuthUserId } from '@convex-dev/auth/server';
import { api } from './_generated/api';
import { SYSTEM_ROLES } from './constants';

/**
 * Creates a new category or returns existing one if label already exists.
 * Requires System Admin role. Updates timestamp on creation.
 *
 * @param label - The category label/name
 * @param parentCategory - Optional parent category ID for hierarchical categories
 * @returns The ID of the created or existing category
 */
export const createCategory = mutation({
  args: { label: v.string(), parentCategory: v.optional(v.id('categories')) },
  handler: async (ctx, args) => {
    //check if user is System Admin
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      throw new Error('Not authenticated');
    }

    const userSystemRole = await ctx.runQuery(api.users.getUserSystemRole, { userId });

    if (userSystemRole !== SYSTEM_ROLES[0]) {
      throw new Error("User ist not a System admin an therfor can't add a category");
    }

    //continue if systemRole check is valid
    const existing = await ctx.db
      .query('categories')
      .withIndex('by_label', (q) => q.eq('label', args.label))
      .unique();
    const parent = args.parentCategory ? await ctx.db.get(args.parentCategory) : null;

    if (!existing) {
      const newCategoryId = await ctx.db.insert('categories', {
        label: args.label,
        updatedAt: Date.now(),
        parentCategory: parent?._id,
      });

      return newCategoryId;
    } else {
      // If existing, return id of existing category
      return existing._id;
    }
  },
});

/**
 * Retrieves all categories from the database.
 *
 * @returns Array of all category objects
 */
export const getAllCategories = query({
  args: {},
  handler: async (ctx) => {
    const categories = await ctx.db.query('categories').collect();

    return categories;
  },
});

/**
 * Gets the label/name of a category by its ID.
 *
 * @param categoryId - The ID of the category to look up
 * @returns The category label string, or undefined if not found
 */
export const getCategoryLabel = query({
  args: { categoryId: v.id('categories') },
  handler: async (ctx, { categoryId }) => {
    const category = await ctx.db.get(categoryId);

    return category?.label;
  },
});

/**
 * Gets the ID of a category by its label/name.
 *
 * @param args.categoryLabel - The label/name of the category to look up
 * @returns The category ID, or undefined if not found
 */
export const getCategoryId = query({
  args: { categoryLabel: v.string() },
  handler: async (ctx, { categoryLabel }) => {
    const category = await ctx.db
      .query('categories')
      .withIndex('by_label', (q) => q.eq('label', categoryLabel))
      .unique();
    return category?._id;
  },
});

/**
 * Seeds the database with default categories if none exist.
 * Only runs if no categories are present. Creates German category labels.
 *
 * @returns Success message string
 */
export const seedCategories = internalMutation({
  args: {},
  handler: async (ctx) => {
    const anyCategory = await ctx.db.query('categories').first();
    if (anyCategory) {
      return;
    }

    const categories = [
      'Kleidung',
      'Schuhe',
      'Sport',
      'Elektronik',
      'Bücher',
      'Spielzeug',
      'Möbel',
      'Haushalt',
      'Accessoires',
      'Sonstiges',
    ];
    for (const label of categories) {
      const existing = await ctx.db
        .query('categories')
        .withIndex('by_label', (q) => q.eq('label', label))
        .unique();
      if (!existing) {
        await ctx.db.insert('categories', {
          label: label,
          updatedAt: Date.now(),
        });
      }
    }

    return 'Categories seeded successfully';
  },
});
