import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api } from '../_generated/api';
import { missingForEvent } from '../eventFeatures';

type TestConvex = ReturnType<typeof convexTest>;
const HOUR = 60 * 60 * 1000;

/** A seller with one photo-less item and two upcoming events: one requires photos, one not. */
async function setup(t: TestConvex) {
  const sellerId = await t.run(async (ctx) =>
    ctx.db.insert('users', { name: 'Seller', email: 'seller@test.de' })
  );
  const categoryId = await t.run(async (ctx) =>
    ctx.db.insert('categories', { label: 'Spielzeug', updatedAt: Date.now() })
  );
  const productId = await t.run(async (ctx) =>
    ctx.db.insert('products', {
      title: 'Puzzle',
      description: '',
      condition: 'good',
      images: [],
      productCategory: categoryId,
      price: 3,
      vendorId: sellerId,
      readyForSale: true,
      sold: false,
      updatedAt: Date.now(),
    })
  );
  const insertEvent = (title: string, photosOptional: boolean) =>
    t.run(async (ctx) =>
      ctx.db.insert('events', {
        title,
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
        features: { photosOptional },
      })
    );
  return {
    t,
    seller: t.withIdentity({ subject: sellerId }),
    categoryId,
    productId,
    photoEventId: await insertEvent('Fahrradbörse', false),
    noPhotoEventId: await insertEvent('Kinderbasar', true),
  };
}

const storePhoto = (t: TestConvex) => t.run(async (ctx) => ctx.storage.store(new Blob()));

describe('photo requirement per event', () => {
  test('missingForEvent asks for a photo only where the event requires one', () => {
    expect(missingForEvent({ images: [] }, {})).toEqual(['photo']);
    expect(missingForEvent({ images: [] }, { features: { photosOptional: true } })).toEqual([]);
    expect(missingForEvent({ images: ['photo'] }, {})).toEqual([]);
  });

  test('a photo-less item can be announced where photos are optional', async () => {
    const s = await setup(convexTest(schema));
    await s.seller.mutation(api.eventProducts.addProductToEvent, {
      eventId: s.noPhotoEventId,
      productId: s.productId,
    });
    await s.seller.mutation(api.eventProducts.setProductEvents, {
      productId: s.productId,
      eventIds: [s.noPhotoEventId],
    });
  });

  test('a photo-less item is rejected where photos are required', async () => {
    const s = await setup(convexTest(schema));
    await expect(
      s.seller.mutation(api.eventProducts.addProductToEvent, {
        eventId: s.photoEventId,
        productId: s.productId,
      })
    ).rejects.toThrow('„Puzzle“ braucht für „Fahrradbörse“ noch: Foto.');
    await expect(
      s.seller.mutation(api.eventProducts.setProductEvents, {
        productId: s.productId,
        eventIds: [s.noPhotoEventId, s.photoEventId],
      })
    ).rejects.toThrow('Foto');
    const relations = await s.t.run(async (ctx) => ctx.db.query('eventProducts').collect());
    expect(relations).toEqual([]);
  });

  test('adding a photo makes the item ready for the event', async () => {
    const s = await setup(convexTest(schema));
    const photo = await storePhoto(s.t);
    await s.seller.mutation(api.products.addProductImages, {
      productId: s.productId,
      images: [photo],
    });
    expect((await s.t.run(async (ctx) => ctx.db.get(s.productId)))?.images).toEqual([photo]);
    await s.seller.mutation(api.eventProducts.addProductToEvent, {
      eventId: s.photoEventId,
      productId: s.productId,
    });
  });

  test('only the seller adds photos to an item', async () => {
    const s = await setup(convexTest(schema));
    const strangerId = await s.t.run(async (ctx) =>
      ctx.db.insert('users', { name: 'Stranger', email: 'stranger@test.de' })
    );
    await expect(
      s.t.withIdentity({ subject: strangerId }).mutation(api.products.addProductImages, {
        productId: s.productId,
        images: [await storePhoto(s.t)],
      })
    ).rejects.toThrow('Not authorized');
  });

  test('an edit keeps the last photo while an upcoming event requires one', async () => {
    const s = await setup(convexTest(schema));
    const photo = await storePhoto(s.t);
    await s.seller.mutation(api.products.addProductImages, {
      productId: s.productId,
      images: [photo],
    });
    await s.seller.mutation(api.eventProducts.setProductEvents, {
      productId: s.productId,
      eventIds: [s.photoEventId],
    });
    const edit = (images: (typeof photo)[]) =>
      s.seller.mutation(api.products.updateProduct, {
        productId: s.productId,
        title: 'Puzzle',
        description: '',
        condition: 'good',
        productCategory: s.categoryId,
        images,
        price: 4,
        readyForSale: true,
      });

    await expect(edit([])).rejects.toThrow('„Fahrradbörse“ verlangt ein Foto');
    await edit([photo]);

    // Once announced only where photos are optional, the photo may go
    await s.seller.mutation(api.eventProducts.setProductEvents, {
      productId: s.productId,
      eventIds: [s.noPhotoEventId],
    });
    await edit([]);
    expect((await s.t.run(async (ctx) => ctx.db.get(s.productId)))?.images).toEqual([]);
  });
});
