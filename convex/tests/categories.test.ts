import { describe, expect, test, beforeEach } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api, internal } from '../_generated/api';
import { Id } from '../_generated/dataModel';

describe('Convex Categories Tests', () => {
  let t: ReturnType<typeof convexTest>;
  let adminUserId: Id<'users'>;

  beforeEach(async () => {
    t = convexTest(schema);
    adminUserId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Admin',
        email: 'admin@adminmail.com',
        systemRole: 'admin',
      });
    });
  });

  test('Admin can create categories', async () => {
    // Log in as "admin" and create category
    const category = await t
      .withIdentity({ subject: adminUserId })
      .mutation(api.categories.createCategory, {
        label: 'music',
      });

    // Check if category is in the DB
    const result = await t.run(async (ctx) => {
      return await ctx.db.get(category);
    });

    expect(result).not.toBeNull();
    expect(result?.label).toBe('music');
    expect(result?.parentCategory).toBe(undefined);
    expect(result?.updatedAt).toBeLessThanOrEqual(Date.now());
  });

  test('Admin can create categories with parent', async () => {
    // Log in as "admin" and create parent category and child category
    const parentCategory = await t
      .withIdentity({ subject: adminUserId })
      .mutation(api.categories.createCategory, {
        label: 'Parent',
      });

    const childCategory = await t
      .withIdentity({ subject: adminUserId })
      .mutation(api.categories.createCategory, {
        label: 'Child',
        parentCategory: parentCategory,
      });

    // Check if category is in the DB
    const result = await t.run(async (ctx) => {
      return await ctx.db.get(childCategory);
    });

    expect(result).not.toBeNull();
    expect(result?.label).toBe('Child');
    expect(result?.parentCategory).toBe(parentCategory);
    expect(result?.updatedAt).toBeLessThanOrEqual(Date.now());
  });

  test('Non-Admin can not create categories', async () => {
    // Create non-admin user in DB
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'user',
        email: 'user@mail.com',
        systemRole: 'user',
      });
    });

    // check if throws Error
    await expect(
      t.withIdentity({ subject: userId }).mutation(api.categories.createCategory, {
        label: 'Music',
      })
    ).rejects.toThrow("User ist not a System admin an therfor can't add a category");
  });

  test('Unauthenticated user can not create categories', async () => {
    await expect(
      t.mutation(api.categories.createCategory, {
        label: 'Music',
      })
    ).rejects.toThrow('Not authenticated');
  });

  test('Creating multiple instances of same category returns id of existing one', async () => {
    // Log in as "admin" and create category
    const category = await t
      .withIdentity({ subject: adminUserId })
      .mutation(api.categories.createCategory, {
        label: 'Music',
      });

    // Check id of second category
    const category2 = await t
      .withIdentity({ subject: adminUserId })
      .mutation(api.categories.createCategory, {
        label: 'Music',
      });

    expect(category2).toBe(category);
  });

  test('getAllCategories really gets all available categories (even without authentication)', async () => {
    // Log in as "admin" and create categories
    await t.withIdentity({ subject: adminUserId }).mutation(api.categories.createCategory, {
      label: 'Music',
    });

    await t.withIdentity({ subject: adminUserId }).mutation(api.categories.createCategory, {
      label: 'Books',
    });

    await expect(await t.query(api.categories.getAllCategories)).toHaveLength(2);
  });

  test('getCategoryLabel really returns label', async () => {
    // Log in as "admin" and create category
    const category = await t
      .withIdentity({ subject: adminUserId })
      .mutation(api.categories.createCategory, {
        label: 'Music',
      });

    expect(await t.query(api.categories.getCategoryLabel, { categoryId: category })).toBe('Music');
  });

  test('getCategoryLabel returns undefined if label if category doesnt exist', async () => {
    // Log in as "admin" and create any category
    const category = await t
      .withIdentity({ subject: adminUserId })
      .mutation(api.categories.createCategory, {
        label: 'Music',
      });
    await t.run(async (ctx) => {
      ctx.db.delete(category);
    });

    expect(await t.query(api.categories.getCategoryLabel, { categoryId: category })).toBeNull();
  });

  test('getCategoryId really returns Id', async () => {
    // Log in as "admin" and create category
    const category = await t
      .withIdentity({ subject: adminUserId })
      .mutation(api.categories.createCategory, {
        label: 'Music',
      });

    expect(await t.query(api.categories.getCategoryId, { categoryLabel: 'Music' })).toBe(category);
  });

  test('getCategoryId returns undefined if label if category doesnt exist', async () => {
    // Log in as "admin" and create any category
    const category = await t
      .withIdentity({ subject: adminUserId })
      .mutation(api.categories.createCategory, {
        label: 'Music',
      });
    await t.run(async (ctx) => {
      ctx.db.delete(category);
    });

    expect(await t.query(api.categories.getCategoryId, { categoryLabel: 'music' })).toBeNull();
  });

  test('seedCategories seeds default categories', async () => {
    await t.mutation(internal.categories.seedCategories);
    const categories = await t.query(api.categories.getAllCategories);
    expect(categories.length).toBeGreaterThan(0);
    // Check for specific seeded categories
    const clothing = categories.find((c) => c.label === 'Kleidung');
    expect(clothing).toBeDefined();
  });

  test('seedCategories does not duplicate existing categories', async () => {
    await t.mutation(internal.categories.seedCategories);
    const countAfterFirstSeed = (await t.query(api.categories.getAllCategories)).length;

    await t.mutation(internal.categories.seedCategories);
    const countAfterSecondSeed = (await t.query(api.categories.getAllCategories)).length;

    expect(countAfterSecondSeed).toBe(countAfterFirstSeed);
  });

  test('createCategory with non-existent parent ID creates root category', async () => {
    const tempId = await t
      .withIdentity({ subject: adminUserId })
      .mutation(api.categories.createCategory, {
        label: 'Temp',
      });
    await t.run(async (ctx) => {
      await ctx.db.delete(tempId);
    });

    const orphan = await t
      .withIdentity({ subject: adminUserId })
      .mutation(api.categories.createCategory, {
        label: 'Orphan',
        parentCategory: tempId,
      });

    const result = await t.run(async (ctx) => {
      return await ctx.db.get(orphan);
    });

    expect(result).not.toBeNull();
    expect(result?.label).toBe('Orphan');
    expect(result?.parentCategory).toBeUndefined();
  });
});
