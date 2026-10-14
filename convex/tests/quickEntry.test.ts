import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api } from '../_generated/api';

const HOUR = 60 * 60 * 1000;

async function setup(photosOptional = true) {
  const t = convexTest(schema);
  const ids = await t.run(async (ctx) => {
    const organizerId = await ctx.db.insert('users', { name: 'Orga', email: 'orga@test.de' });
    const sellerId = await ctx.db.insert('users', { name: 'Anna', email: 'anna@test.de' });
    const strangerId = await ctx.db.insert('users', { name: 'Fremd', email: 'fremd@test.de' });
    const clothes = await ctx.db.insert('categories', {
      label: 'Kinderkleidung',
      updatedAt: Date.now(),
    });
    const toys = await ctx.db.insert('categories', { label: 'Spielzeug', updatedAt: Date.now() });
    const eventId = await ctx.db.insert('events', {
      title: 'Kinderbasar',
      description: '',
      location: 'Halle',
      startDate: Date.now() + 24 * HOUR,
      endDate: Date.now() + 30 * HOUR,
      contactInfo: '',
      categories: [clothes, toys],
      services: [],
      visibility: 'public',
      approvalStatus: 'approved',
      commission: 10,
      organizerId,
      features: { photosOptional },
    });
    await ctx.db.insert('eventRole', { event: eventId, user: sellerId, roles: 'seller' });
    return { sellerId, strangerId, clothes, toys, eventId };
  });
  return { t, ...ids, asSeller: t.withIdentity({ subject: ids.sellerId }) };
}

describe('quick entry', () => {
  test('creates several items without photo and announces them for the bazaar', async () => {
    const s = await setup();
    const created = await s.asSeller.mutation(api.products.addProductsToEvent, {
      eventId: s.eventId,
      items: [
        {
          title: ' Body ',
          productCategory: s.clothes,
          condition: 'good',
          price: 2,
          attributes: { size: '74', brand: 'H&M', unknown: 'x' },
        },
        { title: 'Puzzle 100 Teile', productCategory: s.toys, condition: 'very-good', price: 3 },
      ],
    });
    expect(created.map((item) => item.title)).toEqual(['Body', 'Puzzle 100 Teile']);

    const products = await s.t.run((ctx) => ctx.db.query('products').collect());
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({
      vendorId: s.sellerId,
      images: [],
      readyForSale: true,
      sold: false,
      // Only the fields of the category are kept
      attributes: { size: '74', brand: 'H&M' },
    });
    const relations = await s.t.run((ctx) => ctx.db.query('eventProducts').collect());
    expect(relations.map((r) => [r.eventId, r.status])).toEqual([
      [s.eventId, 'announced'],
      [s.eventId, 'announced'],
    ]);
  });

  test('one invalid row saves nothing and names the row', async () => {
    const s = await setup();
    await expect(
      s.asSeller.mutation(api.products.addProductsToEvent, {
        eventId: s.eventId,
        items: [
          { title: 'Body', productCategory: s.clothes, condition: 'good', price: 2 },
          { title: 'Ho', productCategory: s.clothes, condition: 'good', price: 4 },
        ],
      })
    ).rejects.toThrow('Zeile 2: Der Titel braucht mindestens 3 Zeichen.');
    await expect(
      s.asSeller.mutation(api.products.addProductsToEvent, {
        eventId: s.eventId,
        items: [
          {
            title: 'Jacke',
            productCategory: s.clothes,
            condition: 'good',
            price: 5,
            minimumPrice: 6,
          },
        ],
      })
    ).rejects.toThrow('Zeile 1: Der Mindestpreis muss unter dem Verkaufspreis liegen.');
    await expect(
      s.asSeller.mutation(api.products.addProductsToEvent, {
        eventId: s.eventId,
        items: [{ title: 'Jacke', productCategory: s.clothes, condition: 'good', price: -1 }],
      })
    ).rejects.toThrow('Zeile 1: Bitte einen gültigen Preis');
    expect(await s.t.run((ctx) => ctx.db.query('products').collect())).toHaveLength(0);
  });

  test('only for registered sellers of a bazaar that allows items without photo', async () => {
    const item = (category: never) => ({
      title: 'Body',
      productCategory: category,
      condition: 'good' as const,
      price: 2,
    });
    const s = await setup();
    await expect(
      s.t.withIdentity({ subject: s.strangerId }).mutation(api.products.addProductsToEvent, {
        eventId: s.eventId,
        items: [item(s.clothes as never)],
      })
    ).rejects.toThrow('Melde dich zuerst');
    await expect(
      s.asSeller.mutation(api.products.addProductsToEvent, { eventId: s.eventId, items: [] })
    ).rejects.toThrow('mindestens einen Artikel');

    const withPhotos = await setup(false);
    await expect(
      withPhotos.asSeller.mutation(api.products.addProductsToEvent, {
        eventId: withPhotos.eventId,
        items: [item(withPhotos.clothes as never)],
      })
    ).rejects.toThrow('braucht jeder Artikel ein Foto');
  });
});
