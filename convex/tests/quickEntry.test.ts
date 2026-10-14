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

describe('quick entry with photos', () => {
  test('a bazaar that requires photos accepts rows with a photo', async () => {
    const s = await setup(false);
    const photo = await s.t.run((ctx) => ctx.storage.store(new Blob(['jpg'])));
    await s.asSeller.mutation(api.products.addProductsToEvent, {
      eventId: s.eventId,
      items: [
        {
          title: 'Kinderrad',
          productCategory: s.toys,
          condition: 'good',
          price: 40,
          images: [photo],
        },
      ],
    });
    const [product] = await s.t.run((ctx) => ctx.db.query('products').collect());
    expect(product.images).toEqual([photo]);

    await expect(
      s.asSeller.mutation(api.products.addProductsToEvent, {
        eventId: s.eventId,
        items: [
          {
            title: 'Laufrad',
            productCategory: s.toys,
            condition: 'good',
            price: 20,
            images: Array.from({ length: 6 }, () => photo),
          },
        ],
      })
    ).rejects.toThrow('Zeile 1: Höchstens 5 Fotos.');
  });
});

describe('registering existing items', () => {
  async function withItems(photosOptional = true) {
    const s = await setup(photosOptional);
    const insert = (title: string, extra: object = {}) =>
      s.t.run((ctx) =>
        ctx.db.insert('products', {
          title,
          vendorId: s.sellerId,
          description: '',
          condition: 'good',
          images: [],
          productCategory: s.clothes,
          price: 3,
          readyForSale: true,
          sold: false,
          updatedAt: Date.now(),
          ...extra,
        })
      );
    return { ...s, insert };
  }

  test('left-over items are registered at once, already registered ones are skipped', async () => {
    const s = await withItems();
    const jacket = await s.insert('Jacke');
    const trousers = await s.insert('Hose');
    await s.t.run((ctx) =>
      ctx.db.insert('eventProducts', {
        eventId: s.eventId,
        productId: trousers,
        status: 'announced',
      })
    );
    expect(
      await s.asSeller.mutation(api.products.addExistingProductsToEvent, {
        eventId: s.eventId,
        productIds: [jacket, trousers, jacket],
      })
    ).toBe(1);
    const relations = await s.t.run((ctx) => ctx.db.query('eventProducts').collect());
    expect(relations.map((relation) => relation.productId).sort()).toEqual(
      [jacket, trousers].sort()
    );
  });

  test('sold, archived, foreign and photo-less items are refused', async () => {
    const s = await withItems(false);
    const cases: [string, object, string][] = [
      ['Verkauft', { sold: true }, 'ist verkauft'],
      ['Archiv', { archivedAt: Date.now() }, 'ist archiviert'],
      ['Ohne Foto', {}, 'hat kein Foto'],
      ['Fremd', { vendorId: s.strangerId }, 'Not authorized'],
    ];
    for (const [title, extra, message] of cases) {
      const productId = await s.insert(title, extra);
      await expect(
        s.asSeller.mutation(api.products.addExistingProductsToEvent, {
          eventId: s.eventId,
          productIds: [productId],
        })
      ).rejects.toThrow(message);
    }
    await expect(
      s.t
        .withIdentity({ subject: s.strangerId })
        .mutation(api.products.addExistingProductsToEvent, { eventId: s.eventId, productIds: [] })
    ).rejects.toThrow('Melde dich zuerst');
  });

  test('the item limit counts for single and bulk registration', async () => {
    const s = await withItems();
    await s.t.run((ctx) =>
      ctx.db.patch(s.eventId, { features: { photosOptional: true, maxItemsPerSeller: 1 } })
    );
    const first = await s.insert('Body');
    const second = await s.insert('Hose');
    await s.asSeller.mutation(api.eventProducts.addProductToEvent, {
      eventId: s.eventId,
      productId: first,
    });
    await expect(
      s.asSeller.mutation(api.eventProducts.addProductToEvent, {
        eventId: s.eventId,
        productId: second,
      })
    ).rejects.toThrow('höchstens 1 Artikel');
    await expect(
      s.asSeller.mutation(api.products.addExistingProductsToEvent, {
        eventId: s.eventId,
        productIds: [second],
      })
    ).rejects.toThrow('höchstens 1 Artikel');
  });
});
