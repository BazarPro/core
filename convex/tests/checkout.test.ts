import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api } from '../_generated/api';
import type { Id } from '../_generated/dataModel';

type TestConvex = ReturnType<typeof convexTest>;
const HOUR = 60 * 60 * 1000;

/** Running event with two sellers: Anna has two items, Ben one. */
async function setup(features: { minimumPrice?: boolean; priceOffers?: boolean } = {}) {
  const t = convexTest(schema);
  const ids = await t.run(async (ctx) => {
    const organizerId = await ctx.db.insert('users', { name: 'Orga', email: 'orga@test.de' });
    const annaId = await ctx.db.insert('users', { name: 'Anna', email: 'anna@test.de' });
    const benId = await ctx.db.insert('users', { name: 'Ben', email: 'ben@test.de' });
    const buyerId = await ctx.db.insert('users', { name: 'Käufer', email: 'kaeufer@test.de' });
    const categoryId = await ctx.db.insert('categories', {
      label: 'Kinderkleidung',
      updatedAt: Date.now(),
    });
    const eventId = await ctx.db.insert('events', {
      title: 'Kinderbasar',
      description: '',
      location: 'Halle',
      startDate: Date.now() - HOUR,
      endDate: Date.now() + 5 * HOUR,
      contactInfo: '',
      categories: [categoryId],
      services: [],
      visibility: 'public',
      approvalStatus: 'approved',
      commission: 10,
      organizerId,
      features,
    });
    await ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' });
    const item = async (vendorId: Id<'users'>, title: string, price: number, extra = {}) => {
      const productId = await ctx.db.insert('products', {
        title,
        vendorId,
        description: '',
        condition: 'good',
        images: [],
        productCategory: categoryId,
        price,
        readyForSale: true,
        sold: false,
        updatedAt: Date.now(),
        attributes: { size: '104' },
        ...extra,
      });
      const eventProductId = await ctx.db.insert('eventProducts', {
        eventId,
        productId,
        status: 'available',
      });
      return { productId, eventProductId };
    };
    return {
      organizerId,
      annaId,
      benId,
      buyerId,
      eventId,
      categoryId,
      jacke: await item(annaId, 'Jacke', 12),
      hose: await item(annaId, 'Hose', 6, { minimumPrice: 4 }),
      buch: await item(benId, 'Buch', 2),
    };
  });
  return { t, ...ids, asOrganizer: t.withIdentity({ subject: ids.organizerId }) };
}

async function mails(t: TestConvex) {
  const jobs = await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
  return jobs
    .filter((job) => job.name.includes('sendNotification'))
    .map((job) => job.args[0] as { to: string; subject: string; details?: { label: string }[] });
}

describe('cash desk cart', () => {
  test('sells all items of a buyer at once; one email per seller, one receipt', async () => {
    const s = await setup();
    const result = await s.asOrganizer.mutation(api.purchases.sellProducts, {
      items: [
        { eventProductId: s.jacke.eventProductId },
        { eventProductId: s.hose.eventProductId },
        { eventProductId: s.buch.eventProductId },
      ],
      buyerEmail: ' kaeufer@test.de ',
    });
    expect(result.purchaseIds).toHaveLength(3);
    expect(result.total).toBe(20);

    const purchases = await s.t.run((ctx) => ctx.db.query('purchase').collect());
    expect(purchases.map((p) => p.totalAmount).sort((a, b) => a - b)).toEqual([2, 6, 12]);
    const statuses = await s.t.run((ctx) =>
      Promise.all(
        [s.jacke, s.hose, s.buch].map(
          async ({ eventProductId }) => (await ctx.db.get(eventProductId))?.status
        )
      )
    );
    expect(statuses).toEqual(['sold', 'sold', 'sold']);

    const sent = await mails(s.t);
    expect(sent.filter((m) => m.to === 'anna@test.de').map((m) => m.subject)).toEqual([
      'Verkauft: 2 Artikel bei Kinderbasar',
    ]);
    expect(sent.filter((m) => m.to === 'ben@test.de').map((m) => m.subject)).toEqual([
      'Verkauft: Buch',
    ]);
    const receipts = sent.filter((m) => m.to === 'kaeufer@test.de');
    expect(receipts.map((m) => m.subject)).toEqual(['Dein Kaufbeleg: 3 Artikel bei Kinderbasar']);
    expect(receipts[0].details?.map((d) => d.label)).toEqual(['Jacke', 'Hose', 'Buch', 'Bezahlt']);
  });

  test('if one item cannot be sold, nothing is sold and the error names it', async () => {
    const s = await setup();
    // Sold at another cash desk meanwhile
    await s.asOrganizer.mutation(api.purchases.sellProduct, {
      eventProductId: s.buch.eventProductId,
    });
    await expect(
      s.asOrganizer.mutation(api.purchases.sellProducts, {
        items: [
          { eventProductId: s.jacke.eventProductId },
          { eventProductId: s.buch.eventProductId },
        ],
      })
    ).rejects.toThrow('„Buch“');
    expect((await s.t.run((ctx) => ctx.db.get(s.jacke.eventProductId)))?.status).toBe('available');
    expect(await s.t.run((ctx) => ctx.db.query('purchase').collect())).toHaveLength(1);
  });

  test('negotiated price and duplicates, empty and foreign carts', async () => {
    const s = await setup({ minimumPrice: true });
    await expect(
      s.asOrganizer.mutation(api.purchases.sellProducts, {
        items: [
          { eventProductId: s.jacke.eventProductId },
          { eventProductId: s.jacke.eventProductId },
        ],
      })
    ).rejects.toThrow('doppelt');
    await expect(s.asOrganizer.mutation(api.purchases.sellProducts, { items: [] })).rejects.toThrow(
      'leer'
    );
    await expect(
      s.t.withIdentity({ subject: s.buyerId }).mutation(api.purchases.sellProducts, {
        items: [{ eventProductId: s.jacke.eventProductId }],
      })
    ).rejects.toThrow('auth.forbidden');
    await expect(
      s.asOrganizer.mutation(api.purchases.sellProducts, {
        items: [{ eventProductId: s.hose.eventProductId, negotiatedPrice: 3 }],
      })
    ).rejects.toThrow('zwischen');

    const result = await s.asOrganizer.mutation(api.purchases.sellProducts, {
      items: [
        { eventProductId: s.hose.eventProductId, negotiatedPrice: 5 },
        { eventProductId: s.buch.eventProductId },
      ],
    });
    expect(result.total).toBe(7);
  });

  test('an accepted offer is redeemed in the cart', async () => {
    const s = await setup({ priceOffers: true });
    const offerId = await s.t.run((ctx) =>
      ctx.db.insert('productOffers', {
        eventId: s.eventId,
        productId: s.jacke.productId,
        eventProductId: s.jacke.eventProductId,
        buyerId: s.buyerId,
        amount: 9,
        status: 'accepted',
        createdAt: Date.now(),
      })
    );
    const result = await s.asOrganizer.mutation(api.purchases.sellProducts, {
      items: [{ eventProductId: s.jacke.eventProductId, offerId }],
    });
    expect(result.total).toBe(9);
    expect((await s.t.run((ctx) => ctx.db.get(offerId)))?.status).toBe('redeemed');
  });

  test('items of two events cannot be sold together', async () => {
    const s = await setup();
    const other = await s.t.run(async (ctx) => {
      const eventId = await ctx.db.insert('events', {
        title: 'Anderer Basar',
        description: '',
        location: 'Halle 2',
        startDate: Date.now() - HOUR,
        endDate: Date.now() + HOUR,
        contactInfo: '',
        categories: [s.categoryId],
        services: [],
        visibility: 'public',
        approvalStatus: 'approved',
        commission: 10,
        organizerId: s.organizerId,
      });
      await ctx.db.insert('eventRole', { event: eventId, user: s.organizerId, roles: 'organizer' });
      const productId = await ctx.db.insert('products', {
        title: 'Puzzle',
        vendorId: s.benId,
        description: '',
        condition: 'good',
        images: [],
        productCategory: s.categoryId,
        price: 3,
        readyForSale: true,
        sold: false,
        updatedAt: Date.now(),
      });
      return await ctx.db.insert('eventProducts', { eventId, productId, status: 'available' });
    });
    await expect(
      s.asOrganizer.mutation(api.purchases.sellProducts, {
        items: [{ eventProductId: s.jacke.eventProductId }, { eventProductId: other }],
      })
    ).rejects.toThrow('selben Veranstaltung');
  });
});

describe('checkout item', () => {
  test('current price, size and minimum price for the event team only', async () => {
    const s = await setup({ minimumPrice: true });
    await s.t.run((ctx) => ctx.db.patch(s.jacke.eventProductId, { discountPercent: 25 }));

    const jacke = await s.asOrganizer.query(api.purchases.getCheckoutItem, {
      eventId: s.eventId,
      productId: s.jacke.productId,
    });
    expect(jacke).toMatchObject({
      title: 'Jacke',
      status: 'available',
      price: 12,
      discountPercent: 25,
      listPrice: 9,
      sellerPaidOut: false,
      attributes: [{ label: 'Größe', value: '104' }],
    });
    // No minimum price set: no negotiating for this item
    expect(jacke?.minimumPrice).toBeUndefined();
    const hose = await s.asOrganizer.query(api.purchases.getCheckoutItem, {
      eventId: s.eventId,
      productId: s.hose.productId,
    });
    expect(hose?.minimumPrice).toBe(4);

    await expect(
      s.t.withIdentity({ subject: s.buyerId }).query(api.purchases.getCheckoutItem, {
        eventId: s.eventId,
        productId: s.jacke.productId,
      })
    ).rejects.toThrow('auth.forbidden');
  });

  test('null for an item that is not part of the event', async () => {
    const s = await setup();
    const foreign = await s.t.run((ctx) =>
      ctx.db.insert('products', {
        title: 'Fremd',
        vendorId: s.benId,
        description: '',
        condition: 'good',
        images: [],
        productCategory: s.categoryId,
        price: 1,
        readyForSale: true,
        sold: false,
        updatedAt: Date.now(),
      })
    );
    expect(
      await s.asOrganizer.query(api.purchases.getCheckoutItem, {
        eventId: s.eventId,
        productId: foreign,
      })
    ).toBeNull();

    // A scanned ID from another table (e.g. user or purchase) returns null without throwing
    expect(
      await s.asOrganizer.query(api.purchases.getCheckoutItem, {
        eventId: s.eventId,
        productId: s.annaId,
      })
    ).toBeNull();

    const sale = await s.asOrganizer.mutation(api.purchases.sellProducts, {
      items: [{ eventProductId: s.jacke.eventProductId }],
    });
    expect(
      await s.asOrganizer.query(api.purchases.getCheckoutItem, {
        eventId: s.eventId,
        productId: sale.purchaseIds[0],
      })
    ).toBeNull();

    expect(
      await s.asOrganizer.query(api.purchases.getCheckoutItem, {
        eventId: s.eventId,
        productId: 'not-a-valid-id',
      })
    ).toBeNull();
  });
});
