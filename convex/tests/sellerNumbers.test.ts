import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api } from '../_generated/api';
import type { Id } from '../_generated/dataModel';

const HOUR = 60 * 60 * 1000;

async function setup(features: { maxItemsPerSeller?: number; photosOptional?: boolean } = {}) {
  const t = convexTest(schema);
  const ids = await t.run(async (ctx) => {
    const organizerId = await ctx.db.insert('users', { name: 'Orga', email: 'orga@test.de' });
    const users = await Promise.all(
      ['anna', 'ben', 'cleo'].map((name) =>
        ctx.db.insert('users', { name, email: `${name}@test.de` })
      )
    );
    const categoryId = await ctx.db.insert('categories', {
      label: 'Kinderkleidung',
      updatedAt: Date.now(),
    });
    const eventId = await ctx.db.insert('events', {
      title: 'Kinderbasar',
      description: '',
      location: 'Halle',
      startDate: Date.now() + 24 * HOUR,
      endDate: Date.now() + 30 * HOUR,
      contactInfo: '',
      categories: [categoryId],
      services: [],
      visibility: 'public',
      approvalStatus: 'approved',
      commission: 10,
      organizerId,
      accessCode: 'BASAR',
      features,
    });
    await ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' });
    return { organizerId, users, categoryId, eventId };
  });
  const as = (id: Id<'users'>) => t.withIdentity({ subject: id });
  return { t, ...ids, as, asOrganizer: as(ids.organizerId) };
}

type TestConvex = Awaited<ReturnType<typeof setup>>['t'];

async function numberOf(t: TestConvex, eventId: Id<'events'>, user: Id<'users'>) {
  return await t.run(async (ctx) => {
    const row = await ctx.db
      .query('eventSeller')
      .withIndex('by_event_user', (q) => q.eq('event', eventId).eq('user', user))
      .first();
    return row?.number;
  });
}

describe('seller numbers', () => {
  test('sellers get running numbers when they join; numbers are not reused', async () => {
    const s = await setup();
    const [anna, ben, cleo] = s.users;
    for (const user of [anna, ben]) {
      await s.as(user).mutation(api.eventSeller.joinEvent, {
        eventId: s.eventId,
        accessCode: 'BASAR',
      });
    }
    expect(await numberOf(s.t, s.eventId, anna)).toBe(1);
    expect(await numberOf(s.t, s.eventId, ben)).toBe(2);
    expect(await s.as(ben).query(api.sellerNumbers.getMySellerNumber, { eventId: s.eventId })).toBe(
      2
    );

    // Anna leaves; the next seller does not get her number
    await s.as(anna).mutation(api.events.leaveEvent, { eventId: s.eventId });
    await s.as(cleo).mutation(api.eventSeller.joinEvent, {
      eventId: s.eventId,
      accessCode: 'BASAR',
    });
    expect(await numberOf(s.t, s.eventId, cleo)).toBe(3);

    // Cleo had the highest number and leaves: her number is not given out again either
    await s.as(cleo).mutation(api.events.leaveEvent, { eventId: s.eventId });
    await s.as(anna).mutation(api.eventSeller.joinEvent, {
      eventId: s.eventId,
      accessCode: 'BASAR',
    });
    expect(await numberOf(s.t, s.eventId, anna)).toBe(4);

    const vendors = await s.asOrganizer.query(api.eventRoles.getVendorsForEvent, {
      eventId: s.eventId,
    });
    expect(vendors.map((vendor) => vendor.sellerNumber).sort()).toEqual([2, 4]);
  });

  test('walk-in sellers get a number too', async () => {
    const s = await setup();
    await s.t.run((ctx) =>
      ctx.db.patch(s.eventId, { startDate: Date.now() - HOUR, endDate: Date.now() + HOUR })
    );
    const walkIn = await s.asOrganizer.mutation(api.walkInSellers.createWalkInSeller, {
      eventId: s.eventId,
      firstName: 'Erika',
      lastName: 'Muster',
    });
    expect(await numberOf(s.t, s.eventId, walkIn as Id<'users'>)).toBe(1);
  });

  test('sellers from before numbers existed get theirs, in the order they joined', async () => {
    const s = await setup();
    const [anna, ben, cleo] = s.users;
    await s.t.run(async (ctx) => {
      for (const user of [anna, ben, cleo]) {
        await ctx.db.insert('eventRole', { event: s.eventId, user, roles: 'seller' });
      }
      // Ben has an old row without number, Anna and Cleo none at all
      await ctx.db.insert('eventSeller', {
        event: s.eventId,
        user: ben,
        totalFee: 0,
        comissionFee: 0,
        numberpayoutAmount: 0,
        payoutReceived: false,
      });
    });
    await expect(
      s.as(anna).mutation(api.sellerNumbers.assignMissingSellerNumbers, { eventId: s.eventId })
    ).rejects.toThrow('Not authorized');

    expect(
      await s.asOrganizer.mutation(api.sellerNumbers.assignMissingSellerNumbers, {
        eventId: s.eventId,
      })
    ).toBe(3);
    expect(await numberOf(s.t, s.eventId, anna)).toBe(1);
    expect(await numberOf(s.t, s.eventId, ben)).toBe(2);
    expect(await numberOf(s.t, s.eventId, cleo)).toBe(3);
    // Nothing left to do on the next call
    expect(
      await s.asOrganizer.mutation(api.sellerNumbers.assignMissingSellerNumbers, {
        eventId: s.eventId,
      })
    ).toBe(0);
  });
});

describe('item limit per seller', () => {
  test('registering items stops at the limit of the event', async () => {
    const s = await setup({ maxItemsPerSeller: 2 });
    const [anna] = s.users;
    await s.t.run((ctx) =>
      ctx.db.insert('eventRole', { event: s.eventId, user: anna, roles: 'seller' })
    );
    const product = (title: string) =>
      s.t.run((ctx) =>
        ctx.db.insert('products', {
          title,
          vendorId: anna,
          description: '',
          condition: 'good',
          images: [],
          productCategory: s.categoryId,
          price: 5,
          readyForSale: true,
          sold: false,
          updatedAt: Date.now(),
        })
      );
    for (const title of ['Body', 'Hose']) {
      await s.as(anna).mutation(api.eventProducts.setProductEvents, {
        productId: await product(title),
        eventIds: [s.eventId],
      });
    }
    await expect(
      s.as(anna).mutation(api.eventProducts.setProductEvents, {
        productId: await product('Jacke'),
        eventIds: [s.eventId],
      })
    ).rejects.toThrow('höchstens 2 Artikel pro Verkäufer');
  });

  test('quick entry checks the limit for all rows at once', async () => {
    const s = await setup({ maxItemsPerSeller: 2, photosOptional: true });
    const [anna] = s.users;
    await s.t.run((ctx) =>
      ctx.db.insert('eventRole', { event: s.eventId, user: anna, roles: 'seller' })
    );
    const row = { productCategory: s.categoryId, condition: 'good' as const, price: 2 };
    await expect(
      s.as(anna).mutation(api.products.addProductsToEvent, {
        eventId: s.eventId,
        items: [
          { ...row, title: 'Body' },
          { ...row, title: 'Hose' },
          { ...row, title: 'Jacke' },
        ],
      })
    ).rejects.toThrow('Du kannst noch 2 anmelden');
  });

  test('the limit is validated when the event is saved', async () => {
    const s = await setup();
    await expect(
      s.asOrganizer.mutation(api.events.editEvent, {
        id: s.eventId,
        title: 'Kinderbasar',
        description: '',
        location: 'Halle',
        startDate: Date.now() + 24 * HOUR,
        endDate: Date.now() + 30 * HOUR,
        contactInfo: '',
        categories: [s.categoryId],
        services: [],
        visibility: 'public',
        commission: 10,
        features: { maxItemsPerSeller: 0 },
      })
    ).rejects.toThrow('Artikelgrenze');
  });
});
