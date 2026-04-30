import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api } from '../_generated/api';

/** Event + organizer role (+ product category id for products) */
async function seedEventWithOrganizer(t: ReturnType<typeof convexTest>) {
  const organizerId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Org', email: `org-${Date.now()}@test.com` });
  });
  const productCategoryId = await t.run(async (ctx) => {
    return await ctx.db.insert('categories', { label: 'G', updatedAt: Date.now() });
  });
  const eventId = await t.run(async (ctx) => {
    return await ctx.db.insert('events', {
      title: 'E',
      description: 'D',
      location: 'L',
      startDate: 1,
      endDate: 2,
      categories: [productCategoryId],
      contactInfo: 'C',
      commission: 0,
      services: [],
      visibility: 'public',
      organizerId,
    });
  });
  await t.run(async (ctx) => {
    await ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' });
  });
  return { organizerId, eventId, productCategoryId };
}

describe('eventLocationCategories', () => {
  test('list, create (trim), update, assign to eventProduct, delete cascades null', async () => {
    const t = convexTest(schema);
    const { organizerId, eventId, productCategoryId } = await seedEventWithOrganizer(t);
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'V', email: `v-${Date.now()}@test.com` });
    });
    const productId = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'P',
        description: 'D',
        price: 1,
        productCategory: productCategoryId,
        images: [],
        vendorId,
        readyForSale: true,
        sold: false,
        condition: 'new',
        updatedAt: Date.now(),
      });
    });
    const epId = await t.run(async (ctx) => {
      return await ctx.db.insert('eventProducts', {
        eventId,
        productId,
        status: 'announced',
      });
    });

    const locCatId = await t.withIdentity({ subject: organizerId }).mutation(
      api.eventLocationCategories.createCategory,
      { eventId, label: '  Reihe 1  ' }
    );

    const listed = await t.withIdentity({ subject: organizerId }).query(
      api.eventLocationCategories.listForEvent,
      { eventId }
    );
    expect(listed.map((r) => r.label)).toEqual(['Reihe 1']);

    await t.withIdentity({ subject: organizerId }).mutation(
      api.eventLocationCategories.updateCategoryLabel,
      { categoryId: locCatId, label: '  Reihe A  ' }
    );
    const afterUpdate = await t.run(async (ctx) => ctx.db.get(locCatId));
    expect(afterUpdate?.label).toBe('Reihe A');

    await t.withIdentity({ subject: organizerId }).mutation(
      api.eventProducts.setEventProductLocationCategory,
      { eventProductId: epId, locationCategoryId: locCatId }
    );
    const epRow = await t.run(async (ctx) => ctx.db.get(epId));
    expect(epRow?.locationCategoryId).toEqual(locCatId);

    await t.withIdentity({ subject: organizerId }).mutation(
      api.eventLocationCategories.deleteCategory,
      { categoryId: locCatId }
    );

    const epAfter = await t.run(async (ctx) => ctx.db.get(epId));
    expect(epAfter?.locationCategoryId).toBeUndefined();
    expect(await t.run(async (ctx) => ctx.db.get(locCatId))).toBeNull();
  });

  test('setEventProductLocationCategory rejects foreign category', async () => {
    const t = convexTest(schema);

    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'o2@test.com' });
    });
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'V', email: 'v2@test.com' });
    });
    const categoryId = await t.run(async (ctx) => {
      return await ctx.db.insert('categories', { label: 'G', updatedAt: Date.now() });
    });
    const eventId = await t.run(async (ctx) => {
      return await ctx.db.insert('events', {
        title: 'E',
        description: 'D',
        location: 'L',
        startDate: 1,
        endDate: 2,
        categories: [categoryId],
        contactInfo: 'C',
        commission: 0,
        services: [],
        visibility: 'public',
        organizerId,
      });
    });
    const otherEventId = await t.run(async (ctx) => {
      return await ctx.db.insert('events', {
        title: 'E2',
        description: 'D',
        location: 'L',
        startDate: 1,
        endDate: 2,
        categories: [categoryId],
        contactInfo: 'C',
        commission: 0,
        services: [],
        visibility: 'public',
        organizerId,
      });
    });
    await t.run(async (ctx) => {
      await ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' });
    });
    const productId = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'P',
        description: 'D',
        price: 1,
        productCategory: categoryId,
        images: [],
        vendorId,
        readyForSale: true,
        sold: false,
        condition: 'new',
        updatedAt: Date.now(),
      });
    });
    const epId = await t.run(async (ctx) => {
      return await ctx.db.insert('eventProducts', {
        eventId,
        productId,
        status: 'announced',
      });
    });

    const foreignLocId = await t.run(async (ctx) => {
      return await ctx.db.insert('eventLocationCategories', {
        eventId: otherEventId,
        label: 'X',
      });
    });

    await expect(
      t.withIdentity({ subject: organizerId }).mutation(
        api.eventProducts.setEventProductLocationCategory,
        { eventProductId: epId, locationCategoryId: foreignLocId }
      )
    ).rejects.toThrow();
  });

  test('createCategory rejects empty label after trim', async () => {
    const t = convexTest(schema);
    const { organizerId, eventId } = await seedEventWithOrganizer(t);
    await expect(
      t.withIdentity({ subject: organizerId }).mutation(
        api.eventLocationCategories.createCategory,
        { eventId, label: '   ' }
      )
    ).rejects.toThrow('Label ist leer');
  });

  test('stranger cannot list or create categories', async () => {
    const t = convexTest(schema);
    const { eventId } = await seedEventWithOrganizer(t);
    const strangerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'X', email: `x-${Date.now()}@test.com` });
    });
    const id = { subject: strangerId };
    await expect(
      t.withIdentity(id).query(api.eventLocationCategories.listForEvent, { eventId })
    ).rejects.toThrow('Not authorized');
    await expect(
      t.withIdentity(id).mutation(api.eventLocationCategories.createCategory, {
        eventId,
        label: 'A',
      })
    ).rejects.toThrow('Not authorized');
  });

  test('unauthenticated access is rejected', async () => {
    const t = convexTest(schema);
    const { eventId } = await seedEventWithOrganizer(t);
    const locId = await t.run(async (ctx) => {
      return await ctx.db.insert('eventLocationCategories', { eventId, label: 'Z' });
    });
    await expect(
      t.query(api.eventLocationCategories.listForEvent, { eventId })
    ).rejects.toThrow('Not authenticated');
    await expect(
      t.mutation(api.eventLocationCategories.createCategory, { eventId, label: 'A' })
    ).rejects.toThrow('Not authenticated');
    await expect(
      t.mutation(api.eventLocationCategories.updateCategoryLabel, {
        categoryId: locId,
        label: 'B',
      })
    ).rejects.toThrow('Not authenticated');
    await expect(
      t.mutation(api.eventLocationCategories.deleteCategory, { categoryId: locId })
    ).rejects.toThrow('Not authenticated');
  });

  test('update and delete reject stranger; update rejects empty label', async () => {
    const t = convexTest(schema);
    const { organizerId, eventId } = await seedEventWithOrganizer(t);
    const locId = await t.withIdentity({ subject: organizerId }).mutation(
      api.eventLocationCategories.createCategory,
      { eventId, label: 'X' }
    );
    const strangerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'S', email: `s-${Date.now()}@test.com` });
    });
    await expect(
      t.withIdentity({ subject: strangerId }).mutation(
        api.eventLocationCategories.updateCategoryLabel,
        { categoryId: locId, label: 'Y' }
      )
    ).rejects.toThrow('Not authorized');
    await expect(
      t.withIdentity({ subject: organizerId }).mutation(
        api.eventLocationCategories.updateCategoryLabel,
        { categoryId: locId, label: '   ' }
      )
    ).rejects.toThrow('Label ist leer');
    await expect(
      t.withIdentity({ subject: strangerId }).mutation(
        api.eventLocationCategories.deleteCategory,
        { categoryId: locId }
      )
    ).rejects.toThrow('Not authorized');
  });
});
