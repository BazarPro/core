import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import type { StoredEventFeatures } from '../eventFeatures';
import { removeSellerAndCoorganizerRolesForUser } from '../eventSeller';

type TestConvex = ReturnType<typeof convexTest>;
const HOUR = 60 * 60 * 1000;

const PROFILE = {
  firstName: 'Anna',
  lastName: 'Rad',
  phone: '0731 123',
  street: 'Münsterplatz 1',
  zipCode: '89073',
  city: 'Ulm',
  country: 'Deutschland',
};

/** A bike market keeping a record of who offers what, a seller and a bike of hers. */
async function setup(
  t: TestConvex,
  features: StoredEventFeatures = { privateSellersOnly: true, fixedSellerData: true },
  profile: Partial<typeof PROFILE> = PROFILE
) {
  const organizerId = await t.run((ctx) =>
    ctx.db.insert('users', { name: 'Orga', email: 'orga@test.de' })
  );
  const sellerId = await t.run((ctx) =>
    ctx.db.insert('users', { name: 'Anna Rad', email: 'anna@test.de', ...profile })
  );
  const categoryId = await t.run((ctx) =>
    ctx.db.insert('categories', { label: 'Fahrräder', updatedAt: Date.now() })
  );
  const eventId = await t.withIdentity({ subject: organizerId }).mutation(api.events.createEvent, {
    title: 'Fahrradmarkt',
    description: '',
    location: 'Münsterplatz',
    startDate: Date.now() + 24 * HOUR,
    endDate: Date.now() + 30 * HOUR,
    categories: [categoryId],
    services: [],
    contactInfo: 'orga@test.de',
    commission: 20,
    visibility: 'logged-in',
    features: { photosOptional: true, ...features },
  });
  const asSeller = t.withIdentity({ subject: sellerId });
  const addBike = (title: string) =>
    asSeller.mutation(api.products.addProduct, {
      title,
      vendorId: sellerId,
      description: '',
      condition: 'good',
      images: [],
      productCategory: categoryId,
      price: 150,
      readyForSale: true,
      sold: false,
      attributes: { frameNumber: 'WBK123' },
    });
  const sellerRow = () =>
    t.run((ctx) =>
      ctx.db
        .query('eventSeller')
        .filter((q) => q.and(q.eq(q.field('event'), eventId), q.eq(q.field('user'), sellerId)))
        .first()
    );
  return { t, sellerId, categoryId, eventId, asSeller, addBike, sellerRow };
}

async function joinAndAnnounce(s: Awaited<ReturnType<typeof setup>>) {
  await s.asSeller.mutation(api.eventSeller.joinEvent, { eventId: s.eventId, privateSeller: true });
  const bikeId = await s.addBike('Trekkingrad');
  await s.asSeller.mutation(api.eventProducts.addProductToEvent, {
    eventId: s.eventId,
    productId: bikeId,
  });
  return bikeId;
}

describe('joining a bazaar that keeps a record', () => {
  test('sellers confirm they sell privately; the confirmation is stored', async () => {
    const s = await setup(convexTest(schema));
    await expect(
      s.asSeller.mutation(api.eventSeller.joinEvent, { eventId: s.eventId })
    ).rejects.toThrow('join.privateRequired');
    await s.asSeller.mutation(api.eventSeller.joinEvent, {
      eventId: s.eventId,
      privateSeller: true,
    });
    expect((await s.sellerRow())?.privateSellerConfirmedAt).toEqual(expect.any(Number));
  });

  test('an incomplete profile is rejected by the backend too', async () => {
    const s = await setup(convexTest(schema), undefined, { firstName: 'Anna' });
    await expect(
      s.asSeller.mutation(api.eventSeller.joinEvent, { eventId: s.eventId, privateSeller: true })
    ).rejects.toThrow('join.profileIncomplete');
  });

  test('other bazaars ask for neither', async () => {
    const s = await setup(convexTest(schema), {}, { firstName: 'Anna' });
    await s.asSeller.mutation(api.eventSeller.joinEvent, { eventId: s.eventId });
    expect((await s.sellerRow())?.privateSellerConfirmedAt).toBeUndefined();
  });
});

describe('fixed seller data', () => {
  test('the first registered item records name and address, later changes do not', async () => {
    const s = await setup(convexTest(schema));
    await s.asSeller.mutation(api.eventSeller.joinEvent, {
      eventId: s.eventId,
      privateSeller: true,
    });
    expect((await s.sellerRow())?.sellerSnapshot).toBeUndefined();
    await joinAndAnnounce(s);
    expect((await s.sellerRow())?.sellerSnapshot).toMatchObject({
      ...PROFILE,
      email: 'anna@test.de',
    });
  });

  test('name and address are fixed until the bazaar is over, the phone is not', async () => {
    const s = await setup(convexTest(schema));
    expect(await s.asSeller.query(api.users.isMyProfileFixed, {})).toBe(false);
    await joinAndAnnounce(s);
    expect(await s.asSeller.query(api.users.isMyProfileFixed, {})).toBe(true);

    await expect(s.asSeller.mutation(api.users.update, { street: 'Neue Str. 2' })).rejects.toThrow(
      'profile.fixed'
    );
    // Sending the unchanged values (the whole form) is fine
    await s.asSeller.mutation(api.users.update, { ...PROFILE, phone: '0731 999' });

    await s.t.run((ctx) =>
      ctx.db.patch(s.eventId, { startDate: Date.now() - 3 * HOUR, endDate: Date.now() - HOUR })
    );
    await s.asSeller.mutation(api.users.update, { street: 'Neue Str. 2' });
  });

  test('title, price and required fields of a registered item are fixed', async () => {
    const s = await setup(convexTest(schema), {
      privateSellersOnly: true,
      fixedSellerData: true,
      requiredFields: ['frameNumber'],
    });
    const bikeId = await joinAndAnnounce(s);
    const edit = (changes: { price?: number; description?: string; frameNumber?: string }) =>
      s.asSeller.mutation(api.products.updateProduct, {
        productId: bikeId,
        title: 'Trekkingrad',
        description: changes.description ?? '',
        condition: 'good',
        productCategory: s.categoryId,
        images: [],
        price: changes.price ?? 150,
        readyForSale: true,
        attributes: { frameNumber: changes.frameNumber ?? 'WBK123' },
      });
    await expect(edit({ price: 120 })).rejects.toThrow('product.dataFixed');
    await expect(edit({ frameNumber: 'XYZ' })).rejects.toThrow('product.dataFixed');
    await expect(
      s.asSeller.mutation(api.products.addProductAttributes, {
        productId: bikeId,
        attributes: { frameNumber: 'XYZ' },
      })
    ).rejects.toThrow('product.dataFixed');
    await edit({ description: 'Mit Gepäckträger' });
    expect(
      await s.asSeller.query(api.eventProducts.getFixedItemData, { productId: bikeId })
    ).toEqual({ fixed: true, fieldKeys: ['frameNumber'] });
  });

  test('items can be withdrawn until the bazaar starts', async () => {
    const s = await setup(convexTest(schema));
    const bikeId = await joinAndAnnounce(s);
    const otherId = await s.addBike('Kinderrad');
    await s.asSeller.mutation(api.eventProducts.addProductToEvent, {
      eventId: s.eventId,
      productId: otherId,
    });
    await s.asSeller.mutation(api.eventProducts.removeProductFromEvent, {
      eventId: s.eventId,
      productId: otherId,
    });

    await s.t.run((ctx) => ctx.db.patch(s.eventId, { startDate: Date.now() - HOUR }));
    await expect(
      s.asSeller.mutation(api.eventProducts.removeProductFromEvent, {
        eventId: s.eventId,
        productId: bikeId,
      })
    ).rejects.toThrow('product.recordedNoRemove');
    await expect(
      s.asSeller.mutation(api.eventProducts.setProductEvents, { productId: bikeId, eventIds: [] })
    ).rejects.toThrow('product.recordedNoRemove');
  });

  test('deleting the account keeps the record of the bazaar', async () => {
    const s = await setup(convexTest(schema));
    const bikeId = await joinAndAnnounce(s);
    await s.t.run((ctx) =>
      removeSellerAndCoorganizerRolesForUser(ctx as unknown as MutationCtx, s.sellerId)
    );
    const relations = await s.t.run((ctx) =>
      ctx.db
        .query('eventProducts')
        .filter((q) => q.eq(q.field('productId'), bikeId as Id<'products'>))
        .collect()
    );
    expect(relations).toHaveLength(1);
    expect((await s.sellerRow())?.sellerSnapshot?.lastName).toBe('Rad');
  });
});

describe('record of offered items', () => {
  test('lists every item with the recorded details and the sale, for the team only', async () => {
    const s = await setup(convexTest(schema));
    const bikeId = await joinAndAnnounce(s);
    // Changes after the first item do not reach the record
    await s.t.run((ctx) => ctx.db.patch(s.sellerId, { street: 'Später 9' }));
    await s.t.run(async (ctx) => {
      const relation = await ctx.db
        .query('eventProducts')
        .filter((q) => q.eq(q.field('productId'), bikeId))
        .first();
      await ctx.db.patch(relation!._id, { status: 'sold' });
      await ctx.db.insert('purchase', {
        product: bikeId,
        event: s.eventId,
        seller: s.sellerId,
        totalAmount: 140,
        comissionAmount: 28,
        payoutAmount: 112,
        payoutStatus: false,
        payoutDate: 0,
      });
    });

    await expect(
      s.asSeller.query(api.sellerRecords.getProofOfOffers, { eventId: s.eventId })
    ).rejects.toThrow('auth.forbidden');

    const event = await s.t.run((ctx) => ctx.db.get(s.eventId));
    const proof = await s.t
      .withIdentity({ subject: event!.organizerId })
      .query(api.sellerRecords.getProofOfOffers, { eventId: s.eventId });
    expect(proof.items).toHaveLength(1);
    expect(proof.items[0]).toMatchObject({
      title: 'Trekkingrad',
      category: 'Fahrräder',
      price: 150,
      status: 'sold',
      soldFor: 140,
      attributes: [{ label: 'Rahmennummer', value: 'WBK123' }],
      seller: {
        sellerNumber: 1,
        firstName: 'Anna',
        lastName: 'Rad',
        street: 'Münsterplatz 1',
        fromRecord: true,
        privateSellerConfirmedAt: expect.any(Number),
      },
    });
  });
});
