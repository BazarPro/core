import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api } from '../_generated/api';
import type { Id } from '../_generated/dataModel';

type TestConvex = ReturnType<typeof convexTest>;
type Status = 'announced' | 'available' | 'sold' | 'returned';
const HOUR = 60 * 60 * 1000;

async function setup(t: TestConvex, status: Status, eventTiming: 'running' | 'past' = 'running') {
  const sellerId = await t.run((ctx) =>
    ctx.db.insert('users', { name: 'Seller', email: 'seller@test.de' })
  );
  const categoryId = await t.run((ctx) =>
    ctx.db.insert('categories', { label: 'Trekkingräder', updatedAt: Date.now() })
  );
  const productId = await t.run((ctx) =>
    ctx.db.insert('products', {
      title: 'Trekkingrad',
      description: '',
      condition: 'good',
      images: [],
      productCategory: categoryId,
      price: 200,
      vendorId: sellerId,
      readyForSale: true,
      sold: status === 'sold',
      updatedAt: Date.now(),
    })
  );
  const eventId = await t.run((ctx) =>
    ctx.db.insert('events', {
      title: 'Börse',
      description: '',
      location: 'Halle',
      startDate: eventTiming === 'running' ? Date.now() - HOUR : Date.now() - 3 * HOUR,
      endDate: eventTiming === 'running' ? Date.now() + HOUR : Date.now() - 2 * HOUR,
      contactInfo: '',
      categories: [categoryId],
      services: [],
      visibility: 'logged-in',
      commission: 10,
      organizerId: sellerId,
    })
  );
  const eventProductId = await t.run((ctx) =>
    ctx.db.insert('eventProducts', { eventId, productId, status })
  );
  const nextEventId = await t.run((ctx) =>
    ctx.db.insert('events', {
      title: 'Nächste Börse',
      description: '',
      location: 'Halle',
      startDate: Date.now() + 24 * HOUR,
      endDate: Date.now() + 26 * HOUR,
      contactInfo: '',
      categories: [categoryId],
      services: [],
      visibility: 'logged-in',
      commission: 10,
      organizerId: sellerId,
    })
  );
  return {
    seller: t.withIdentity({ subject: sellerId }),
    productId,
    categoryId,
    eventId,
    eventProductId,
    nextEventId: nextEventId as Id<'events'>,
  };
}

const edit = (s: Awaited<ReturnType<typeof setup>>, price = 180) =>
  s.seller.mutation(api.products.updateProduct, {
    productId: s.productId,
    title: 'Trekkingrad',
    description: 'überarbeitet',
    condition: 'good',
    productCategory: s.categoryId,
    images: [],
    price,
    readyForSale: true,
  });

describe('product locking', () => {
  test.each([
    ['announced', false],
    ['available', true],
    ['sold', true],
    ['returned', false],
  ] as const)('%s at a running bazaar → locked: %s', async (status, locked) => {
    const t = convexTest(schema);
    const s = await setup(t, status);
    expect(
      await s.seller.query(api.eventProducts.isProductLockedForSeller, { productId: s.productId })
    ).toBe(locked);
    if (locked) {
      await expect(edit(s)).rejects.toThrow('locked');
    } else {
      await edit(s);
      expect((await t.run((ctx) => ctx.db.get(s.productId)))?.price).toBe(180);
    }
  });

  test('an item left "available" after the bazaar ended is editable again', async () => {
    const t = convexTest(schema);
    const s = await setup(t, 'available', 'past');
    expect(
      await s.seller.query(api.eventProducts.isProductLockedForSeller, { productId: s.productId })
    ).toBe(false);
  });

  test('returned items get no discount any more', async () => {
    const t = convexTest(schema);
    const s = await setup(t, 'returned');
    await expect(
      s.seller.mutation(api.eventProducts.updateProductDiscount, {
        eventId: s.eventId,
        productId: s.productId,
        discountPercent: 10,
      })
    ).rejects.toThrow('verfügbare Produkte');
  });

  test('returned items can be deleted (archived) during the bazaar', async () => {
    const t = convexTest(schema);
    const s = await setup(t, 'returned');
    expect(await s.seller.query(api.products.canDeleteProduct, { productId: s.productId })).toBe(
      true
    );
    await s.seller.mutation(api.products.deleteProduct, { id: s.productId });
    expect((await t.run((ctx) => ctx.db.get(s.productId)))?.archivedAt).toBeDefined();
    // The organizer still sees the return in the settlement
    expect((await t.run((ctx) => ctx.db.get(s.eventProductId)))?.status).toBe('returned');
  });
});

describe('saving event assignments keeps the bazaar history', () => {
  test('a returned item keeps its return and can be announced for the next bazaar', async () => {
    const t = convexTest(schema);
    const s = await setup(t, 'returned');
    // The form sends all selected events, including the one with the return
    await s.seller.mutation(api.eventProducts.setProductEvents, {
      productId: s.productId,
      eventIds: [s.eventId, s.nextEventId],
      status: 'announced',
    });
    const relations = await t.run((ctx) =>
      ctx.db
        .query('eventProducts')
        .withIndex('by_productId', (q) => q.eq('productId', s.productId))
        .collect()
    );
    expect(relations.map((r) => [r.eventId, r.status]).sort()).toEqual(
      [
        [s.eventId, 'returned'],
        [s.nextEventId, 'announced'],
      ].sort()
    );
  });

  test('items from a past bazaar can be saved and moved on', async () => {
    const t = convexTest(schema);
    const s = await setup(t, 'returned', 'past');
    await edit(s);
    await s.seller.mutation(api.eventProducts.setProductEvents, {
      productId: s.productId,
      eventIds: [s.eventId, s.nextEventId],
      status: 'announced',
    });
    const relations = await t.run((ctx) =>
      ctx.db
        .query('eventProducts')
        .withIndex('by_productId', (q) => q.eq('productId', s.productId))
        .collect()
    );
    expect(relations).toHaveLength(2);
  });

  test('deselecting only removes announcements, never handed-in entries', async () => {
    const t = convexTest(schema);
    const s = await setup(t, 'announced');
    await s.seller.mutation(api.eventProducts.setProductEvents, {
      productId: s.productId,
      eventIds: [s.nextEventId],
      status: 'announced',
    });
    expect(await t.run((ctx) => ctx.db.get(s.eventProductId))).toBeNull();

    const t2 = convexTest(schema);
    const r = await setup(t2, 'returned');
    await r.seller.mutation(api.eventProducts.setProductEvents, {
      productId: r.productId,
      eventIds: [],
      status: 'announced',
    });
    expect((await t2.run((ctx) => ctx.db.get(r.eventProductId)))?.status).toBe('returned');
  });

  test('new assignments to past bazaars are still rejected', async () => {
    const t = convexTest(schema);
    const s = await setup(t, 'announced');
    await t.run((ctx) =>
      ctx.db.patch(s.nextEventId, { startDate: Date.now() - 3 * HOUR, endDate: Date.now() - HOUR })
    );
    await expect(
      s.seller.mutation(api.eventProducts.setProductEvents, {
        productId: s.productId,
        eventIds: [s.nextEventId],
        status: 'announced',
      })
    ).rejects.toThrow('Vergangenheit');
  });
});
