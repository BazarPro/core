import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api } from '../_generated/api';
import type { Id } from '../_generated/dataModel';

async function insertMinimalEvent(
  t: ReturnType<typeof convexTest>,
  opts: {
    organizerId: Id<'users'>;
    accessCode?: string;
    vendorLimit?: number;
    saleFeeFixed?: number;
    saleFeePercentage?: number;
  }
) {
  const categoryId = await t.run(async (ctx) => {
    return await ctx.db.insert('categories', { label: 'General', updatedAt: Date.now() });
  });
  return await t.run(async (ctx) => {
    return await ctx.db.insert('events', {
      title: 'Event',
      description: 'D',
      location: 'L',
      startDate: Date.now() + 1000000,
      endDate: Date.now() + 2000000,
      categories: [categoryId],
      contactInfo: 'I',
      commission: 10,
      services: [],
      visibility: 'public',
      organizerId: opts.organizerId,
      accessCode: opts.accessCode,
      vendorLimit: opts.vendorLimit,
      saleFeeFixed: opts.saleFeeFixed,
      saleFeePercentage: opts.saleFeePercentage,
    });
  });
}

describe('eventSeller.joinEvent', () => {
  test('throws when event not found', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'U', email: 'jnf@test.com' });
    });
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'jnf-org@test.com' });
    });
    const eventId = await insertMinimalEvent(t, { organizerId });
    await t.run(async (ctx) => {
      await ctx.db.delete(eventId);
    });
    await expect(
      t.withIdentity({ subject: userId }).mutation(api.eventSeller.joinEvent, { eventId })
    ).rejects.toThrow('Event not found');
  });

  test('throws on data inconsistency when seller role exists without eventSeller row', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'U', email: 'jdc@test.com' });
    });
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'jdc-org@test.com' });
    });
    const eventId = await insertMinimalEvent(t, { organizerId });
    await t.run(async (ctx) => {
      await ctx.db.insert('eventRole', { event: eventId, user: userId, roles: 'seller' });
    });
    await expect(
      t.withIdentity({ subject: userId }).mutation(api.eventSeller.joinEvent, { eventId })
    ).rejects.toThrow('Data inconsistency: seller role without eventSeller entry');
  });

  test('throws when not authenticated', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'o@test.com' });
    });
    const eventId = await insertMinimalEvent(t, { organizerId });
    await expect(t.mutation(api.eventSeller.joinEvent, { eventId })).rejects.toThrow(
      'Not authenticated'
    );
  });

  test('throws on invalid access code when event requires one', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'U', email: 'u3@test.com' });
    });
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'o3@test.com' });
    });
    const eventId = await insertMinimalEvent(t, { organizerId, accessCode: 'SECRET' });
    await expect(
      t.withIdentity({ subject: userId }).mutation(api.eventSeller.joinEvent, {
        eventId,
        accessCode: 'wrong',
      })
    ).rejects.toThrow('Invalid access code');
  });

  test('creates eventSeller and seller role on successful join', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'U', email: 'u4@test.com' });
    });
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'o4@test.com' });
    });
    const eventId = await insertMinimalEvent(t, {
      organizerId,
      accessCode: 'SECRET',
      saleFeeFixed: 5,
      saleFeePercentage: 2,
    });
    await t.withIdentity({ subject: userId }).mutation(api.eventSeller.joinEvent, {
      eventId,
      accessCode: 'SECRET',
    });
    const row = await t.run(async (ctx) => {
      return await ctx.db
        .query('eventSeller')
        .withIndex('by_event_user', (q) => q.eq('event', eventId).eq('user', userId))
        .unique();
    });
    expect(row?.payoutReceived).toBe(false);
    expect(row?.saleFeeFixed).toBe(5);
    expect(row?.saleFeePercentage).toBe(2);
  });

  test('throws when vendor limit reached', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'o6@test.com' });
    });
    const v1 = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'V1', email: 'v1l@test.com' });
    });
    const v2 = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'V2', email: 'v2l@test.com' });
    });
    const eventId = await insertMinimalEvent(t, { organizerId, vendorLimit: 1 });
    await t.withIdentity({ subject: v1 }).mutation(api.eventSeller.joinEvent, { eventId });
    await expect(
      t.withIdentity({ subject: v2 }).mutation(api.eventSeller.joinEvent, { eventId })
    ).rejects.toThrow('Vendor limit reached');
  });

  test('throws on DEMO access code when demo mode is enabled', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'U', email: 'demo@test.com' });
    });
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'orgdemo@test.com' });
    });
    const eventId = await insertMinimalEvent(t, { organizerId, accessCode: 'SECRET' });

    await t.run(async (ctx) => {
      await ctx.db.insert('featureFlags', { key: 'is_demo_mode', value: true });
    });

    await expect(
      t.withIdentity({ subject: userId }).mutation(api.eventSeller.joinEvent, {
        eventId,
        accessCode: 'DEMO',
      })
    ).rejects.toThrow('Invalid access code');
  });
});

describe('eventSeller.checkAccessCode', () => {
  test('throws when event not found', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'ca-org@test.com' });
    });
    const eventId = await insertMinimalEvent(t, { organizerId, accessCode: 'CODE' });
    await t.run(async (ctx) => {
      await ctx.db.delete(eventId);
    });
    await expect(
      t.query(api.eventSeller.checkAccessCode, { eventId, accessCode: 'CODE' })
    ).rejects.toThrow('Event not found');
  });

  test('returns true for demo access code when demo mode enabled', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'ca-org2@test.com' });
    });
    const eventId = await insertMinimalEvent(t, { organizerId, accessCode: 'REAL' });
    await t.run(async (ctx) => {
      await ctx.db.insert('featureFlags', { key: 'is_demo_mode', value: true });
    });
    const result = await t.query(api.eventSeller.checkAccessCode, {
      eventId,
      accessCode: 'DEMO',
    });
    expect(result).toBe(true);
  });
});

describe('eventSeller.isEventSeller', () => {
  test('returns false when not authenticated', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'is-org@test.com' });
    });
    const eventId = await insertMinimalEvent(t, { organizerId });
    const result = await t.query(api.eventSeller.isEventSellerForEvent, { eventId });
    expect(result).toBe(false);
  });

  test('returns true when user has seller role', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'U', email: 'is-u@test.com' });
    });
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'is-org2@test.com' });
    });
    const eventId = await insertMinimalEvent(t, { organizerId });
    await t.run(async (ctx) => {
      await ctx.db.insert('eventRole', { event: eventId, user: userId, roles: 'seller' });
    });
    const result = await t
      .withIdentity({ subject: userId })
      .query(api.eventSeller.isEventSellerForEvent, {
        eventId,
      });
    expect(result).toBe(true);
  });
});

describe('eventSeller.checkAccessCode', () => {
  test('returns true for DEMO access code in demo mode', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'orgdemo2@test.com' });
    });
    const eventId = await insertMinimalEvent(t, { organizerId, accessCode: 'SECRET' });

    await t.run(async (ctx) => {
      await ctx.db.insert('featureFlags', { key: 'is_demo_mode', value: true });
    });

    const result = await t.query(api.eventSeller.checkAccessCode, {
      eventId,
      accessCode: 'DEMO',
    });
    expect(result).toBe(true);
  });
});

describe('eventSeller.markVendorPayoutReceived', () => {
  test('throws when not authenticated', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'mk-org0@test.com' });
    });
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'V', email: 'mk-v0@test.com' });
    });
    const eventId = await insertMinimalEvent(t, { organizerId });
    await expect(
      t.mutation(api.eventSeller.markVendorPayoutReceived, {
        eventId,
        vendorUserId: vendorId,
      })
    ).rejects.toThrow('Not authenticated');
  });

  test('throws when event does not exist', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'mk-orgx@test.com' });
    });
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'V', email: 'mk-vx@test.com' });
    });
    const eventId = await insertMinimalEvent(t, { organizerId });
    await t.run(async (ctx) => {
      await ctx.db.delete(eventId);
    });
    await expect(
      t.withIdentity({ subject: organizerId }).mutation(api.eventSeller.markVendorPayoutReceived, {
        eventId,
        vendorUserId: vendorId,
      })
    ).rejects.toThrow('Event not found');
  });

  test('throws when caller is not organizer', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'mk-org3@test.com' });
    });
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'V', email: 'mk-v3@test.com' });
    });
    const otherSellerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'S', email: 'mk-s@test.com' });
    });
    const eventId = await insertMinimalEvent(t, { organizerId });
    await t.run(async (ctx) => {
      await ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' });
      await ctx.db.insert('eventRole', { event: eventId, user: vendorId, roles: 'seller' });
      await ctx.db.insert('eventRole', { event: eventId, user: otherSellerId, roles: 'seller' });
      await ctx.db.insert('eventSeller', {
        event: eventId,
        user: vendorId,
        totalFee: 0,
        comissionFee: 0,
        numberpayoutAmount: 0,
        payoutReceived: false,
      });
    });
    await expect(
      t
        .withIdentity({ subject: otherSellerId })
        .mutation(api.eventSeller.markVendorPayoutReceived, {
          eventId,
          vendorUserId: vendorId,
        })
    ).rejects.toThrow('Nur Veranstalter können Auszahlungen als erledigt markieren');
  });

  test('throws when vendorUserId is not a seller', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'mk-org4@test.com' });
    });
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'V', email: 'mk-v4@test.com' });
    });
    const randoId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'X', email: 'mk-x@test.com' });
    });
    const eventId = await insertMinimalEvent(t, { organizerId });
    await t.run(async (ctx) => {
      await ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' });
      await ctx.db.insert('eventRole', { event: eventId, user: vendorId, roles: 'seller' });
    });
    await expect(
      t.withIdentity({ subject: organizerId }).mutation(api.eventSeller.markVendorPayoutReceived, {
        eventId,
        vendorUserId: randoId,
      })
    ).rejects.toThrow('Nutzer ist kein Verkäufer für dieses Event');
  });

  test('inserts eventSeller when seller has no row yet (totals from purchases)', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'mk-org5@test.com' });
    });
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'V', email: 'mk-v5@test.com' });
    });
    const categoryId = await t.run(async (ctx) => {
      return await ctx.db.insert('categories', { label: 'C', updatedAt: Date.now() });
    });
    const eventId = await insertMinimalEvent(t, {
      organizerId,
      saleFeeFixed: 1,
      saleFeePercentage: 3,
    });
    const productId = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'P',
        description: 'D',
        price: 100,
        productCategory: categoryId,
        images: [],
        vendorId,
        readyForSale: true,
        sold: true,
        condition: 'new',
        updatedAt: Date.now(),
      });
    });
    await t.run(async (ctx) => {
      await ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' });
      await ctx.db.insert('eventRole', { event: eventId, user: vendorId, roles: 'seller' });
      await ctx.db.insert('purchase', {
        product: productId,
        event: eventId,
        seller: vendorId,
        totalAmount: 100,
        comissionAmount: 10,
        payoutAmount: 90,
        payoutStatus: false,
        payoutDate: 0,
      });
    });
    await t
      .withIdentity({ subject: organizerId })
      .mutation(api.eventSeller.markVendorPayoutReceived, {
        eventId,
        vendorUserId: vendorId,
      });
    const row = await t.run(async (ctx) => {
      return await ctx.db
        .query('eventSeller')
        .withIndex('by_event_user', (q) => q.eq('event', eventId).eq('user', vendorId))
        .unique();
    });
    expect(row?.payoutReceived).toBe(true);
    expect(row?.comissionFee).toBe(10);
    expect(row?.numberpayoutAmount).toBe(90);
  });

  test('no-op when payout already marked received', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'mk-np@test.com' });
    });
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'V', email: 'mk-np-v@test.com' });
    });
    const eventId = await insertMinimalEvent(t, { organizerId });
    await t.run(async (ctx) => {
      await ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' });
      await ctx.db.insert('eventRole', { event: eventId, user: vendorId, roles: 'seller' });
      await ctx.db.insert('eventSeller', {
        event: eventId,
        user: vendorId,
        totalFee: 0,
        comissionFee: 42,
        numberpayoutAmount: 58,
        payoutReceived: true,
      });
    });
    await t
      .withIdentity({ subject: organizerId })
      .mutation(api.eventSeller.markVendorPayoutReceived, {
        eventId,
        vendorUserId: vendorId,
      });
    const row = await t.run(async (ctx) => {
      return await ctx.db
        .query('eventSeller')
        .withIndex('by_event_user', (q) => q.eq('event', eventId).eq('user', vendorId))
        .unique();
    });
    expect(row?.comissionFee).toBe(42);
    expect(row?.numberpayoutAmount).toBe(58);
  });

  test('patches eventSeller from purchases when row already exists', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'mk-org7@test.com' });
    });
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'V', email: 'mk-v7@test.com' });
    });
    const categoryId = await t.run(async (ctx) => {
      return await ctx.db.insert('categories', { label: 'C2', updatedAt: Date.now() });
    });
    const eventId = await insertMinimalEvent(t, { organizerId });
    const p1 = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'P1',
        description: 'D',
        price: 50,
        productCategory: categoryId,
        images: [],
        vendorId,
        readyForSale: true,
        sold: true,
        condition: 'new',
        updatedAt: Date.now(),
      });
    });
    await t.run(async (ctx) => {
      await ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' });
      await ctx.db.insert('eventRole', { event: eventId, user: vendorId, roles: 'seller' });
      await ctx.db.insert('eventSeller', {
        event: eventId,
        user: vendorId,
        totalFee: 0,
        comissionFee: 0,
        numberpayoutAmount: 0,
        payoutReceived: false,
      });
      await ctx.db.insert('purchase', {
        product: p1,
        event: eventId,
        seller: vendorId,
        totalAmount: 50,
        comissionAmount: 5,
        payoutAmount: 45,
        payoutStatus: false,
        payoutDate: 0,
      });
    });
    await t
      .withIdentity({ subject: organizerId })
      .mutation(api.eventSeller.markVendorPayoutReceived, {
        eventId,
        vendorUserId: vendorId,
      });
    const row = await t.run(async (ctx) => {
      return await ctx.db
        .query('eventSeller')
        .withIndex('by_event_user', (q) => q.eq('event', eventId).eq('user', vendorId))
        .unique();
    });
    expect(row?.comissionFee).toBe(5);
    expect(row?.payoutReceived).toBe(true);
  });
});

describe('eventSeller.unmarkVendorPayoutReceived', () => {
  test('throws when not authenticated', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'um-na@test.com' });
    });
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'V', email: 'um-na-v@test.com' });
    });
    const eventId = await insertMinimalEvent(t, { organizerId });
    await t.run(async (ctx) => {
      await ctx.db.insert('eventRole', { event: eventId, user: vendorId, roles: 'seller' });
    });
    await expect(
      t.mutation(api.eventSeller.unmarkVendorPayoutReceived, {
        eventId,
        vendorUserId: vendorId,
      })
    ).rejects.toThrow('Not authenticated');
  });

  test('throws when event does not exist', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'um-orgx@test.com' });
    });
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'V', email: 'um-vx@test.com' });
    });
    const eventId = await insertMinimalEvent(t, { organizerId });
    await t.run(async (ctx) => {
      await ctx.db.delete(eventId);
    });
    await expect(
      t
        .withIdentity({ subject: organizerId })
        .mutation(api.eventSeller.unmarkVendorPayoutReceived, {
          eventId,
          vendorUserId: vendorId,
        })
    ).rejects.toThrow('Event not found');
  });

  test('throws when vendorUserId is not a seller', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'um-ns@test.com' });
    });
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'V', email: 'um-ns-v@test.com' });
    });
    const randoId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'X', email: 'um-ns-x@test.com' });
    });
    const eventId = await insertMinimalEvent(t, { organizerId });
    await t.run(async (ctx) => {
      await ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' });
      await ctx.db.insert('eventRole', { event: eventId, user: vendorId, roles: 'seller' });
    });
    await expect(
      t
        .withIdentity({ subject: organizerId })
        .mutation(api.eventSeller.unmarkVendorPayoutReceived, {
          eventId,
          vendorUserId: randoId,
        })
    ).rejects.toThrow('Nutzer ist kein Verkäufer für dieses Event');
  });

  test('no-op when payout not yet marked received', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'um-np@test.com' });
    });
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'V', email: 'um-np-v@test.com' });
    });
    const eventId = await insertMinimalEvent(t, { organizerId });
    await t.run(async (ctx) => {
      await ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' });
      await ctx.db.insert('eventRole', { event: eventId, user: vendorId, roles: 'seller' });
      await ctx.db.insert('eventSeller', {
        event: eventId,
        user: vendorId,
        totalFee: 0,
        comissionFee: 5,
        numberpayoutAmount: 5,
        payoutReceived: false,
      });
    });
    await t
      .withIdentity({ subject: organizerId })
      .mutation(api.eventSeller.unmarkVendorPayoutReceived, {
        eventId,
        vendorUserId: vendorId,
      });
    const row = await t.run(async (ctx) => {
      return await ctx.db
        .query('eventSeller')
        .withIndex('by_event_user', (q) => q.eq('event', eventId).eq('user', vendorId))
        .unique();
    });
    expect(row?.comissionFee).toBe(5);
    expect(row?.payoutReceived).toBe(false);
  });

  test('throws when caller is not organizer', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'um-org3@test.com' });
    });
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'V', email: 'um-v3@test.com' });
    });
    const otherSellerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'S', email: 'um-s@test.com' });
    });
    const eventId = await insertMinimalEvent(t, { organizerId });
    await t.run(async (ctx) => {
      await ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' });
      await ctx.db.insert('eventRole', { event: eventId, user: vendorId, roles: 'seller' });
      await ctx.db.insert('eventRole', { event: eventId, user: otherSellerId, roles: 'seller' });
    });
    await expect(
      t
        .withIdentity({ subject: otherSellerId })
        .mutation(api.eventSeller.unmarkVendorPayoutReceived, {
          eventId,
          vendorUserId: vendorId,
        })
    ).rejects.toThrow('Nur Veranstalter können Auszahlungsmarkierungen zurücknehmen');
  });

  test('clears payout flag and payout-related fee fields', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'um-org7@test.com' });
    });
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'V', email: 'um-v7@test.com' });
    });
    const eventId = await insertMinimalEvent(t, { organizerId });
    await t.run(async (ctx) => {
      await ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' });
      await ctx.db.insert('eventRole', { event: eventId, user: vendorId, roles: 'seller' });
      await ctx.db.insert('eventSeller', {
        event: eventId,
        user: vendorId,
        totalFee: 200,
        comissionFee: 20,
        numberpayoutAmount: 180,
        payoutReceived: true,
      });
    });
    await t
      .withIdentity({ subject: organizerId })
      .mutation(api.eventSeller.unmarkVendorPayoutReceived, {
        eventId,
        vendorUserId: vendorId,
      });
    const row = await t.run(async (ctx) => {
      return await ctx.db
        .query('eventSeller')
        .withIndex('by_event_user', (q) => q.eq('event', eventId).eq('user', vendorId))
        .unique();
    });
    expect(row?.payoutReceived).toBe(false);
    expect(row?.comissionFee).toBe(0);
    expect(row?.numberpayoutAmount).toBe(0);
    expect(row?.totalFee).toBe(200);
  });
});

describe('eventSeller.removeSellerAndCoorganizerRoles', () => {
  test('returns false when not authenticated', async () => {
    const t = convexTest(schema);

    const result = await t.mutation(api.eventSeller.removeSellerAndCoorganizerRoles, {});

    expect(result).toBe(false);
  });

  test('removes seller role, coorganizer role, and only own eventProducts from seller events', async () => {
    const t = convexTest(schema);

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'User', email: 'remove-u@test.com' });
    });

    const otherUserId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Other', email: 'remove-other@test.com' });
    });

    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'remove-org@test.com' });
    });

    const categoryId = await t.run(async (ctx) => {
      return await ctx.db.insert('categories', { label: 'C', updatedAt: Date.now() });
    });

    const sellerEventId = await insertMinimalEvent(t, { organizerId });
    const coorganizerEventId = await insertMinimalEvent(t, { organizerId });
    const unrelatedEventId = await insertMinimalEvent(t, { organizerId });

    const ownProductInSellerEvent = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'Own product in seller event',
        description: 'D',
        price: 10,
        productCategory: categoryId,
        images: [],
        vendorId: userId,
        readyForSale: true,
        sold: false,
        condition: 'new',
        updatedAt: Date.now(),
      });
    });

    const otherUsersProductInSellerEvent = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'Other product in seller event',
        description: 'D',
        price: 20,
        productCategory: categoryId,
        images: [],
        vendorId: otherUserId,
        readyForSale: true,
        sold: false,
        condition: 'new',
        updatedAt: Date.now(),
      });
    });

    const ownProductInUnrelatedEvent = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'Own product in unrelated event',
        description: 'D',
        price: 30,
        productCategory: categoryId,
        images: [],
        vendorId: userId,
        readyForSale: true,
        sold: false,
        condition: 'new',
        updatedAt: Date.now(),
      });
    });

    const sellerRoleId = await t.run(async (ctx) => {
      return await ctx.db.insert('eventRole', {
        event: sellerEventId,
        user: userId,
        roles: 'seller',
      });
    });

    const coorganizerRoleId = await t.run(async (ctx) => {
      return await ctx.db.insert('eventRole', {
        event: coorganizerEventId,
        user: userId,
        roles: 'coorganizer',
      });
    });

    const ownEventProductId = await t.run(async (ctx) => {
      return await ctx.db.insert('eventProducts', {
        eventId: sellerEventId,
        productId: ownProductInSellerEvent,
        status: 'announced',
      });
    });

    const foreignEventProductId = await t.run(async (ctx) => {
      return await ctx.db.insert('eventProducts', {
        eventId: sellerEventId,
        productId: otherUsersProductInSellerEvent,
        status: 'announced',
      });
    });

    const unrelatedOwnEventProductId = await t.run(async (ctx) => {
      return await ctx.db.insert('eventProducts', {
        eventId: unrelatedEventId,
        productId: ownProductInUnrelatedEvent,
        status: 'announced',
      });
    });

    await t
      .withIdentity({ subject: userId })
      .mutation(api.eventSeller.removeSellerAndCoorganizerRoles, {});

    const sellerRole = await t.run(async (ctx) => ctx.db.get(sellerRoleId));
    const coorganizerRole = await t.run(async (ctx) => ctx.db.get(coorganizerRoleId));

    const ownEventProduct = await t.run(async (ctx) => ctx.db.get(ownEventProductId));
    const foreignEventProduct = await t.run(async (ctx) => ctx.db.get(foreignEventProductId));
    const unrelatedOwnEventProduct = await t.run(async (ctx) =>
      ctx.db.get(unrelatedOwnEventProductId)
    );

    expect(sellerRole).toBeNull();
    expect(coorganizerRole).toBeNull();

    expect(ownEventProduct).toBeNull();
    expect(foreignEventProduct).not.toBeNull();
    expect(unrelatedOwnEventProduct).not.toBeNull();
  });

  test('deletes seller roles for multiple events and removes own products from each seller event', async () => {
    const t = convexTest(schema);

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'User', email: 'remove-multi@test.com' });
    });

    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'remove-multi-org@test.com' });
    });

    const categoryId = await t.run(async (ctx) => {
      return await ctx.db.insert('categories', { label: 'C', updatedAt: Date.now() });
    });

    const eventA = await insertMinimalEvent(t, { organizerId });
    const eventB = await insertMinimalEvent(t, { organizerId });

    const productA = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'Product A',
        description: 'D',
        price: 11,
        productCategory: categoryId,
        images: [],
        vendorId: userId,
        readyForSale: true,
        sold: false,
        condition: 'new',
        updatedAt: Date.now(),
      });
    });

    const productB = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'Product B',
        description: 'D',
        price: 12,
        productCategory: categoryId,
        images: [],
        vendorId: userId,
        readyForSale: true,
        sold: false,
        condition: 'new',
        updatedAt: Date.now(),
      });
    });

    const sellerRoleA = await t.run(async (ctx) => {
      return await ctx.db.insert('eventRole', {
        event: eventA,
        user: userId,
        roles: 'seller',
      });
    });

    const sellerRoleB = await t.run(async (ctx) => {
      return await ctx.db.insert('eventRole', {
        event: eventB,
        user: userId,
        roles: 'seller',
      });
    });

    const eventProductA = await t.run(async (ctx) => {
      return await ctx.db.insert('eventProducts', {
        eventId: eventA,
        productId: productA,
        status: 'announced',
      });
    });

    const eventProductB = await t.run(async (ctx) => {
      return await ctx.db.insert('eventProducts', {
        eventId: eventB,
        productId: productB,
        status: 'announced',
      });
    });

    await t
      .withIdentity({ subject: userId })
      .mutation(api.eventSeller.removeSellerAndCoorganizerRoles, {});

    expect(await t.run(async (ctx) => ctx.db.get(sellerRoleA))).toBeNull();
    expect(await t.run(async (ctx) => ctx.db.get(sellerRoleB))).toBeNull();

    expect(await t.run(async (ctx) => ctx.db.get(eventProductA))).toBeNull();
    expect(await t.run(async (ctx) => ctx.db.get(eventProductB))).toBeNull();
  });

  test('ignores dangling eventProducts whose product no longer exists', async () => {
    const t = convexTest(schema);

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'User', email: 'remove-dangling@test.com' });
    });

    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'remove-dangling-org@test.com' });
    });

    const categoryId = await t.run(async (ctx) => {
      return await ctx.db.insert('categories', { label: 'C', updatedAt: Date.now() });
    });

    const eventId = await insertMinimalEvent(t, { organizerId });

    const ownProduct = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'Own product',
        description: 'D',
        price: 10,
        productCategory: categoryId,
        images: [],
        vendorId: userId,
        readyForSale: true,
        sold: false,
        condition: 'new',
        updatedAt: Date.now(),
      });
    });

    const sellerRoleId = await t.run(async (ctx) => {
      return await ctx.db.insert('eventRole', {
        event: eventId,
        user: userId,
        roles: 'seller',
      });
    });

    const ownEventProductId = await t.run(async (ctx) => {
      return await ctx.db.insert('eventProducts', {
        eventId,
        productId: ownProduct,
        status: 'announced',
      });
    });

    const missingProductId = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'To be deleted',
        description: 'D',
        price: 99,
        productCategory: categoryId,
        images: [],
        vendorId: userId,
        readyForSale: true,
        sold: false,
        condition: 'new',
        updatedAt: Date.now(),
      });
    });

    const danglingEventProductId = await t.run(async (ctx) => {
      return await ctx.db.insert('eventProducts', {
        eventId,
        productId: missingProductId,
        status: 'announced',
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.delete(missingProductId);
    });

    await t
      .withIdentity({ subject: userId })
      .mutation(api.eventSeller.removeSellerAndCoorganizerRoles, {});

    expect(await t.run(async (ctx) => ctx.db.get(sellerRoleId))).toBeNull();
    expect(await t.run(async (ctx) => ctx.db.get(ownEventProductId))).toBeNull();

    // because the implementation skips missing products
    expect(await t.run(async (ctx) => ctx.db.get(danglingEventProductId))).not.toBeNull();
  });
});
