import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api } from '../_generated/api';

describe('Event Roles', () => {
  test('isOrganizerOfAnyProductEvent identifies organizer', async () => {
    const t = convexTest(schema);

    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Organizer', email: 'org@test.com' });
    });
    const categoryId = await t.run(async (ctx) => {
      return await ctx.db.insert('categories', { label: 'General', updatedAt: Date.now() });
    });
    const eventId = await t.run(async (ctx) => {
      return await ctx.db.insert('events', {
        title: 'Test Event',
        description: 'D',
        location: 'L',
        startDate: 100,
        endDate: 200,
        categories: [categoryId],
        contactInfo: 'I',
        commission: 10,
        services: [],
        visibility: 'public',
        organizerId: organizerId,
      });
    });
    const productId = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'P1',
        description: 'D',
        price: 10,
        productCategory: categoryId,
        images: [],
        vendorId: organizerId,
        readyForSale: true,
        sold: false,
        condition: 'new',
        updatedAt: Date.now(),
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' });
      await ctx.db.insert('eventProducts', { eventId, productId, status: 'announced' });
    });

    const result = await t.query(api.eventRoles.isOrganizerOfAnyProductEvent, {
      productId,
      userId: organizerId,
    });
    expect(result).toBe(eventId);

    const otherUserId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Other' }));
    const resultOther = await t.query(api.eventRoles.isOrganizerOfAnyProductEvent, {
      productId,
      userId: otherUserId,
    });
    expect(resultOther).toBeNull();

    // userId undefined
    const resultUndefined = await t.query(api.eventRoles.isOrganizerOfAnyProductEvent, {
      productId,
    });
    expect(resultUndefined).toBeNull();
  });

  test('getVendorsForEvent calculates correctly', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Organizer', email: 'org@test.com' });
    });
    const vendor1Id = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Vendor 1', email: 'v1@test.com' });
    });
    const categoryId = await t.run(async (ctx) => {
      return await ctx.db.insert('categories', { label: 'General', updatedAt: Date.now() });
    });
    const eventId = await t.run(async (ctx) => {
      return await ctx.db.insert('events', {
        title: 'Event',
        description: 'D',
        location: 'L',
        startDate: 100,
        endDate: 200,
        categories: [categoryId],
        contactInfo: 'I',
        commission: 10,
        services: [],
        visibility: 'public',
        organizerId: organizerId,
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert('eventRole', { event: eventId, user: vendor1Id, roles: 'seller' });
      await ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' });
      const pid = await ctx.db.insert('products', {
        title: 'Sold Product',
        description: 'D',
        price: 100,
        productCategory: categoryId,
        images: [],
        vendorId: vendor1Id,
        readyForSale: true,
        sold: true,
        condition: 'new',
        updatedAt: Date.now(),
      });
      await ctx.db.insert('eventProducts', { eventId, productId: pid, status: 'sold' });
      await ctx.db.insert('purchase', {
        product: pid,
        event: eventId,
        seller: vendor1Id,
        totalAmount: 100,
        comissionAmount: 10,
        payoutAmount: 90,
        payoutStatus: false,
        payoutDate: Date.now(),
      });
    });

    const vendors = await t
      .withIdentity({ subject: organizerId })
      .query(api.eventRoles.getVendorsForEvent, { eventId });
    expect(vendors).toHaveLength(1);
    expect(vendors[0].totalRevenue).toBe(100);
    expect(vendors[0].payout).toBe(90); // commission should follow event.commission (10%)

    // Test with no vendors
    const emptyEventId = await t.run(async (ctx) => {
      return await ctx.db.insert('events', {
        title: 'Empty',
        description: '',
        location: '',
        startDate: 0,
        endDate: 0,
        categories: [],
        contactInfo: '',
        commission: 0,
        services: [],
        visibility: 'public',
        organizerId,
      });
    });
    await t.run(async (ctx) => {
      await ctx.db.insert('eventRole', {
        event: emptyEventId,
        user: organizerId,
        roles: 'organizer',
      });
    });
    const noVendors = await t
      .withIdentity({ subject: organizerId })
      .query(api.eventRoles.getVendorsForEvent, { eventId: emptyEventId });
    expect(noVendors).toHaveLength(0);
  });

  test('isSeller returns true when user has seller role', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Seller', email: 'seller@test.com' });
    });
    const categoryId = await t.run(async (ctx) => {
      return await ctx.db.insert('categories', { label: 'C', updatedAt: Date.now() });
    });
    const eventId = await t.run(async (ctx) => {
      return await ctx.db.insert('events', {
        title: 'Event',
        description: 'D',
        location: 'L',
        startDate: 1,
        endDate: 2,
        categories: [categoryId],
        contactInfo: 'I',
        commission: 10,
        services: [],
        visibility: 'public',
        organizerId: userId,
      });
    });
    await t.run(async (ctx) => {
      await ctx.db.insert('eventRole', { event: eventId, user: userId, roles: 'seller' });
    });
    const result = await t.query(api.eventRoles.isSeller, { userId });
    expect(result).toBe(true);
  });

  test('isSeller returns false when user has no seller role', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'User', email: 'user@test.com' });
    });
    const result = await t.query(api.eventRoles.isSeller, { userId });
    expect(result).toBe(false);
  });

  test('co-organizer helpers can be added and removed', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Org' }));
    const sellerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Seller' }));
    const eventId = await t.run((ctx) =>
      ctx.db.insert('events', {
        title: 'Event',
        description: '',
        location: '',
        startDate: 0,
        endDate: 0,
        categories: [],
        contactInfo: '',
        commission: 0,
        services: [],
        visibility: 'public',
        organizerId,
      })
    );
    await t.run((ctx) => {
      return Promise.all([
        ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' }),
        ctx.db.insert('eventRole', { event: eventId, user: sellerId, roles: 'seller' }),
      ]);
    });

    await t
      .withIdentity({ subject: organizerId })
      .mutation(api.eventRoles.addCoOrganizerForEvent, { eventId, userId: sellerId });

    const helperIds = await t
      .withIdentity({ subject: organizerId })
      .query(api.eventRoles.getCoOrganizerIdsForEvent, { eventId });
    expect(helperIds).toContain(sellerId);

    await t
      .withIdentity({ subject: organizerId })
      .mutation(api.eventRoles.removeCoOrganizerForEvent, { eventId, userId: sellerId });

    const helperIdsAfter = await t
      .withIdentity({ subject: organizerId })
      .query(api.eventRoles.getCoOrganizerIdsForEvent, { eventId });
    expect(helperIdsAfter).not.toContain(sellerId);
  });

  test('co-organizer assignment guards', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Org' }));
    const sellerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Seller' }));
    const otherId = await t.run((ctx) => ctx.db.insert('users', { name: 'Other' }));
    const eventId = await t.run((ctx) =>
      ctx.db.insert('events', {
        title: 'Event',
        description: '',
        location: '',
        startDate: 0,
        endDate: 0,
        categories: [],
        contactInfo: '',
        commission: 0,
        services: [],
        visibility: 'public',
        organizerId,
      })
    );
    await t.run((ctx) => {
      return Promise.all([
        ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' }),
        ctx.db.insert('eventRole', { event: eventId, user: sellerId, roles: 'seller' }),
      ]);
    });

    await expect(
      t
        .withIdentity({ subject: otherId })
        .mutation(api.eventRoles.addCoOrganizerForEvent, { eventId, userId: sellerId })
    ).rejects.toThrow('Not authorized');

    await expect(
      t
        .withIdentity({ subject: organizerId })
        .mutation(api.eventRoles.addCoOrganizerForEvent, { eventId, userId: organizerId })
    ).rejects.toThrow('Organizer');

    await expect(
      t
        .withIdentity({ subject: organizerId })
        .mutation(api.eventRoles.removeCoOrganizerForEvent, { eventId, userId: organizerId })
    ).rejects.toThrow('Organizer');
  });

  test('getMyRolesForEvent(s) returns roles by event', async () => {
    const t = convexTest(schema);
    const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'User' }));
    const eventA = await t.run((ctx) =>
      ctx.db.insert('events', {
        title: 'A',
        description: '',
        location: '',
        startDate: 0,
        endDate: 0,
        categories: [],
        contactInfo: '',
        commission: 0,
        services: [],
        visibility: 'public',
        organizerId: userId,
      })
    );
    const eventB = await t.run((ctx) =>
      ctx.db.insert('events', {
        title: 'B',
        description: '',
        location: '',
        startDate: 0,
        endDate: 0,
        categories: [],
        contactInfo: '',
        commission: 0,
        services: [],
        visibility: 'public',
        organizerId: userId,
      })
    );

    await t.run((ctx) => {
      return Promise.all([
        ctx.db.insert('eventRole', { event: eventA, user: userId, roles: 'organizer' }),
        ctx.db.insert('eventRole', { event: eventB, user: userId, roles: 'coorganizer' }),
      ]);
    });

    const rolesA = await t
      .withIdentity({ subject: userId })
      .query(api.eventRoles.getMyRolesForEvent, { eventId: eventA });
    expect(rolesA).toContain('organizer');

    const rolesByEvent = await t
      .withIdentity({ subject: userId })
      .query(api.eventRoles.getMyRolesForEvents, { eventIds: [eventA, eventB] });

    const entryA = rolesByEvent.find((entry) => entry.eventId === eventA);
    const entryB = rolesByEvent.find((entry) => entry.eventId === eventB);
    expect(entryA?.roles).toContain('organizer');
    expect(entryB?.roles).toContain('coorganizer');
  });

  test('isSeller identifies users with seller role', async () => {
    const t = convexTest(schema);
    const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Seller' }));
    const eventId = await t.run((ctx) =>
      ctx.db.insert('events', {
        title: 'E',
        organizerId: userId,
        commission: 0,
        description: '',
        location: '',
        startDate: 0,
        endDate: 0,
        categories: [],
        contactInfo: '',
        services: [],
        visibility: 'public',
      })
    );

    expect(await t.query(api.eventRoles.isSeller, { userId })).toBe(false);

    await t.run((ctx) =>
      ctx.db.insert('eventRole', { event: eventId, user: userId, roles: 'seller' })
    );
    expect(await t.query(api.eventRoles.isSeller, { userId })).toBe(true);
  });

  test('getMyRolesForEvents with multiple roles for same event', async () => {
    const t = convexTest(schema);
    const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'User' }));
    const eventId = await t.run((ctx) =>
      ctx.db.insert('events', {
        title: 'E',
        organizerId: userId,
        commission: 0,
        description: '',
        location: '',
        startDate: 0,
        endDate: 0,
        categories: [],
        contactInfo: '',
        services: [],
        visibility: 'public',
      })
    );

    await t.run((ctx) => {
      return Promise.all([
        ctx.db.insert('eventRole', { event: eventId, user: userId, roles: 'seller' }),
        ctx.db.insert('eventRole', { event: eventId, user: userId, roles: 'coorganizer' }),
      ]);
    });

    const result = await t
      .withIdentity({ subject: userId })
      .query(api.eventRoles.getMyRolesForEvents, { eventIds: [eventId] });
    expect(result[0].roles).toContain('seller');
    expect(result[0].roles).toContain('coorganizer');
    expect(result[0].roles).toHaveLength(2);
  });

  test('event role queries enforce auth and handle unauthenticated', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Org' }));
    const otherId = await t.run((ctx) => ctx.db.insert('users', { name: 'Other' }));
    const eventId = await t.run((ctx) =>
      ctx.db.insert('events', {
        title: 'Event',
        description: '',
        location: '',
        startDate: 0,
        endDate: 0,
        categories: [],
        contactInfo: '',
        commission: 0,
        services: [],
        visibility: 'public',
        organizerId,
      })
    );
    await t.run((ctx) => {
      return ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' });
    });

    await expect(
      t.withIdentity({ subject: otherId }).query(api.eventRoles.getVendorsForEvent, { eventId })
    ).rejects.toThrow('Not authorized');

    await expect(
      t.withIdentity({ subject: otherId }).query(api.eventRoles.getCoOrganizerIdsForEvent, {
        eventId,
      })
    ).rejects.toThrow('Not authorized');

    const rolesUnauth = await t.query(api.eventRoles.getMyRolesForEvent, { eventId });
    expect(rolesUnauth).toEqual([]);

    const rolesForEventsUnauth = await t.query(api.eventRoles.getMyRolesForEvents, {
      eventIds: [eventId],
    });
    expect(rolesForEventsUnauth).toEqual([]);

    await expect(
      t
        .withIdentity({ subject: organizerId })
        .mutation(api.eventRoles.addCoOrganizerForEvent, { eventId, userId: otherId })
    ).rejects.toThrow('participant');

    await expect(
      t
        .withIdentity({ subject: otherId })
        .mutation(api.eventRoles.removeCoOrganizerForEvent, { eventId, userId: organizerId })
    ).rejects.toThrow('Not authorized');
  });

  test('getVendorsForEvent reflects payoutReceived from eventSeller', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Organizer', email: 'org2@test.com' });
    });
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Vendor', email: 'v2@test.com' });
    });
    const categoryId = await t.run(async (ctx) => {
      return await ctx.db.insert('categories', { label: 'General', updatedAt: Date.now() });
    });
    const eventId = await t.run(async (ctx) => {
      return await ctx.db.insert('events', {
        title: 'Event',
        description: 'D',
        location: 'L',
        startDate: 100,
        endDate: 200,
        categories: [categoryId],
        contactInfo: 'I',
        commission: 10,
        services: [],
        visibility: 'public',
        organizerId,
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
        payoutReceived: true,
      });
    });

    const vendors = await t
      .withIdentity({ subject: organizerId })
      .query(api.eventRoles.getVendorsForEvent, { eventId });
    expect(vendors).toHaveLength(1);
    expect(vendors[0].paid).toBe(true);
  });

  test('markVendorPayoutReceived sets payout flag for organizer', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Organizer', email: 'org3@test.com' });
    });
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Vendor', email: 'v3@test.com' });
    });
    const categoryId = await t.run(async (ctx) => {
      return await ctx.db.insert('categories', { label: 'General', updatedAt: Date.now() });
    });
    const eventId = await t.run(async (ctx) => {
      return await ctx.db.insert('events', {
        title: 'Event',
        description: 'D',
        location: 'L',
        startDate: 100,
        endDate: 200,
        categories: [categoryId],
        contactInfo: 'I',
        commission: 10,
        services: [],
        visibility: 'public',
        organizerId,
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
    });

    await t
      .withIdentity({ subject: organizerId })
      .mutation(api.eventSeller.markVendorPayoutReceived, {
        eventId,
        vendorUserId: vendorId,
      });

    const vendors = await t
      .withIdentity({ subject: organizerId })
      .query(api.eventRoles.getVendorsForEvent, { eventId });
    expect(vendors[0].paid).toBe(true);
  });

  test('unmarkVendorPayoutReceived clears payout flag for organizer', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Organizer', email: 'org4@test.com' });
    });
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Vendor', email: 'v4@test.com' });
    });
    const categoryId = await t.run(async (ctx) => {
      return await ctx.db.insert('categories', { label: 'General', updatedAt: Date.now() });
    });
    const eventId = await t.run(async (ctx) => {
      return await ctx.db.insert('events', {
        title: 'Event',
        description: 'D',
        location: 'L',
        startDate: 100,
        endDate: 200,
        categories: [categoryId],
        contactInfo: 'I',
        commission: 10,
        services: [],
        visibility: 'public',
        organizerId,
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' });
      await ctx.db.insert('eventRole', { event: eventId, user: vendorId, roles: 'seller' });
      await ctx.db.insert('eventSeller', {
        event: eventId,
        user: vendorId,
        totalFee: 100,
        comissionFee: 10,
        numberpayoutAmount: 90,
        payoutReceived: true,
      });
    });

    await t
      .withIdentity({ subject: organizerId })
      .mutation(api.eventSeller.unmarkVendorPayoutReceived, {
        eventId,
        vendorUserId: vendorId,
      });

    const vendors = await t
      .withIdentity({ subject: organizerId })
      .query(api.eventRoles.getVendorsForEvent, { eventId });
    expect(vendors[0].paid).toBe(false);

    const sellerRow = await t.run(async (ctx) => {
      return await ctx.db
        .query('eventSeller')
        .withIndex('by_event_user', (q) => q.eq('event', eventId).eq('user', vendorId))
        .first();
    });
    expect(sellerRow?.comissionFee).toBe(0);
    expect(sellerRow?.numberpayoutAmount).toBe(0);
    expect(sellerRow?.totalFee).toBe(100);
  });
});
