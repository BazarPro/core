import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api } from '../_generated/api';

describe('Inventory Actions', () => {
  test('sellProduct, undoSale and updateProductStatus', async () => {
    const t = convexTest(schema);

    // Setup: User, Category, Event, Product
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Organizer', email: 'org@test.com' });
    });
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Vendor', email: 'v@test.com' });
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
    await t.run(async (ctx) => {
      await ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' });
    });
    const productId = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'Product 1',
        description: 'D',
        price: 100,
        productCategory: categoryId,
        images: [],
        vendorId: vendorId,
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

    await t.run(async (ctx) => {
      await ctx.db.insert('eventSeller', {
        event: eventId,
        user: vendorId,
        totalFee: 0,
        comissionFee: 0,
        numberpayoutAmount: 0,
        payoutReceived: false,
      });
    });

    // Test getEventProduct
    const epDetails = await t
      .withIdentity({ subject: organizerId })
      .query(api.eventProducts.getEventProduct, { eventId, productId });
    expect(epDetails).not.toBeNull();
    expect(epDetails?.product.title).toBe('Product 1');

    // 1. Test updateProductStatus (mark as available)
    await t.withIdentity({ subject: organizerId }).mutation(api.eventProducts.updateProductStatus, {
      eventProductId: epId,
      status: 'available',
    });

    const epAfterAvailable = await t.run(async (ctx) => await ctx.db.get(epId));
    expect(epAfterAvailable?.status).toBe('available');

    // 2. Test sellProduct
    await t.withIdentity({ subject: organizerId }).mutation(api.purchases.sellProduct, {
      eventProductId: epId,
    });

    const epAfterSell = await t.run(async (ctx) => await ctx.db.get(epId));
    expect(epAfterSell?.status).toBe('sold');

    const productAfterSell = await t.run(async (ctx) => await ctx.db.get(productId));
    expect(productAfterSell?.sold).toBe(true);

    const sellerRowAfterSell = await t.run(async (ctx) => {
      return await ctx.db
        .query('eventSeller')
        .withIndex('by_event_user', (q) => q.eq('event', eventId).eq('user', vendorId))
        .first();
    });
    expect(sellerRowAfterSell).not.toBeNull();
    expect(sellerRowAfterSell?.totalFee).toBe(0);
    expect(sellerRowAfterSell?.comissionFee).toBe(0);
    expect(sellerRowAfterSell?.numberpayoutAmount).toBe(0);

    // Test getPurchasesForEvent
    const purchases = await t
      .withIdentity({ subject: organizerId })
      .query(api.purchases.getPurchasesForEvent, { eventId });
    expect(purchases).toHaveLength(1);
    expect(purchases[0].totalAmount).toBe(100);

    // 3. Test undoSale (requires Feature Flag)
    // First, ensure flag exists
    await t.run(async (ctx) => {
      await ctx.db.insert('featureFlags', { key: 'allow_undo_inventory_actions', value: true });
    });

    await t.withIdentity({ subject: organizerId }).mutation(api.purchases.undoSale, {
      eventProductId: epId,
    });

    const sellerRowAfterUndo = await t.run(async (ctx) => {
      return await ctx.db
        .query('eventSeller')
        .withIndex('by_event_user', (q) => q.eq('event', eventId).eq('user', vendorId))
        .first();
    });
    expect(sellerRowAfterUndo?.totalFee).toBe(0);
    expect(sellerRowAfterUndo?.comissionFee).toBe(0);
    expect(sellerRowAfterUndo?.numberpayoutAmount).toBe(0);

    const epAfterUndo = await t.run(async (ctx) => await ctx.db.get(epId));
    expect(epAfterUndo?.status).toBe('available');

    const productAfterUndo = await t.run(async (ctx) => await ctx.db.get(productId));
    expect(productAfterUndo?.sold).toBe(false);

    const purchaseAfterUndo = await t.run(async (ctx) => {
      return await ctx.db
        .query('purchase')
        .filter((q) => q.eq(q.field('product'), productId))
        .unique();
    });
    expect(purchaseAfterUndo).toBeNull();

    // 4. Test undoReturn
    await t.withIdentity({ subject: organizerId }).mutation(api.eventProducts.updateProductStatus, {
      eventProductId: epId,
      status: 'returned',
    });

    await t.withIdentity({ subject: organizerId }).mutation(api.eventProducts.undoReturn, {
      eventProductId: epId,
    });

    const epAfterUndoReturn = await t.run(async (ctx) => await ctx.db.get(epId));
    expect(epAfterUndoReturn?.status).toBe('available');
  });

  test('unauthenticated actions throw errors', async () => {
    const t = convexTest(schema);
    // Create real IDs to pass validator
    const { epId } = await t.run(async (ctx) => {
      const eid = await ctx.db.insert('events', {
        title: 'E',
        description: '',
        location: '',
        startDate: 0,
        endDate: 0,
        categories: [],
        contactInfo: '',
        commission: 0,
        services: [],
        visibility: 'public',
        organizerId: await ctx.db.insert('users', { name: 'O' }),
      });
      const pid = await ctx.db.insert('products', {
        title: 'P',
        description: '',
        price: 0,
        productCategory: await ctx.db.insert('categories', { label: 'C', updatedAt: 0 }),
        images: [],
        vendorId: await ctx.db.insert('users', { name: 'V' }),
        sold: false,
        readyForSale: false,
        condition: 'new',
        updatedAt: 0,
      });
      const epId = await ctx.db.insert('eventProducts', {
        eventId: eid,
        productId: pid,
        status: 'announced',
      });
      return { epId };
    });

    await expect(t.mutation(api.purchases.sellProduct, { eventProductId: epId })).rejects.toThrow(
      'Not authenticated'
    );
    await expect(t.mutation(api.purchases.undoSale, { eventProductId: epId })).rejects.toThrow(
      'Not authenticated'
    );
    await expect(
      t.mutation(api.eventProducts.undoReturn, { eventProductId: epId })
    ).rejects.toThrow('Not authenticated');
    await expect(
      t.mutation(api.eventProducts.updateProductStatus, {
        eventProductId: epId,
        status: 'available',
      })
    ).rejects.toThrow('Not authenticated');
  });

  test('sellProduct and undoSale edge cases', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'O', email: 'o@t.com' });
    });
    const otherUserId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Other', email: 'other@t.com' });
    });
    const categoryId = await t.run(async (ctx) => {
      return await ctx.db.insert('categories', { label: 'C', updatedAt: 0 });
    });
    const eventId = await t.run(async (ctx) => {
      return await ctx.db.insert('events', {
        title: 'E',
        description: '',
        location: '',
        startDate: 0,
        endDate: 0,
        categories: [categoryId],
        contactInfo: '',
        commission: 0,
        services: [],
        visibility: 'public',
        organizerId: organizerId,
      });
    });
    await t.run(async (ctx) => {
      await ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' });
    });
    const productId = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'P',
        description: '',
        price: 10,
        productCategory: categoryId,
        images: [],
        vendorId: otherUserId,
        readyForSale: true,
        sold: false,
        condition: 'new',
        updatedAt: 0,
      });
    });
    const epId = await t.run(async (ctx) => {
      return await ctx.db.insert('eventProducts', { eventId, productId, status: 'announced' });
    });

    // 1. sellProduct - Not authorized
    await expect(
      t.withIdentity({ subject: otherUserId }).mutation(api.purchases.sellProduct, {
        eventProductId: epId,
      })
    ).rejects.toThrow('Not authorized');

    // 2. sellProduct - Not available (announced)
    await expect(
      t.withIdentity({ subject: organizerId }).mutation(api.purchases.sellProduct, {
        eventProductId: epId,
      })
    ).rejects.toThrow('Product is not available for sale');

    // 2b. sellProduct - blocked when vendor payout already marked as received
    await t.run(async (ctx) => {
      await ctx.db.patch(epId, { status: 'available' });
      await ctx.db.insert('eventSeller', {
        event: eventId,
        user: otherUserId,
        totalFee: 0,
        comissionFee: 0,
        numberpayoutAmount: 0,
        payoutReceived: true,
      });
    });
    await expect(
      t.withIdentity({ subject: organizerId }).mutation(api.purchases.sellProduct, {
        eventProductId: epId,
      })
    ).rejects.toThrow('bereits ausbezahlt');

    // 3. undoSale - Feature flag disabled
    await t.run(async (ctx) => {
      await ctx.db.insert('featureFlags', { key: 'allow_undo_inventory_actions', value: false });
      await ctx.db.patch(epId, { status: 'sold' });
    });
    await expect(
      t.withIdentity({ subject: organizerId }).mutation(api.purchases.undoSale, {
        eventProductId: epId,
      })
    ).rejects.toThrow('deaktiviert');

    // 4. undoSale - Not authorized
    await t.run(async (ctx) => {
      const flag = await ctx.db
        .query('featureFlags')
        .withIndex('by_key', (q) => q.eq('key', 'allow_undo_inventory_actions'))
        .unique();
      if (flag) await ctx.db.patch(flag._id, { value: true });
    });
    await expect(
      t.withIdentity({ subject: otherUserId }).mutation(api.purchases.undoSale, {
        eventProductId: epId,
      })
    ).rejects.toThrow('Not authorized');

    // 5. undoSale - Not sold
    await t.run(async (ctx) => {
      await ctx.db.patch(epId, { status: 'available' });
    });
    await expect(
      t.withIdentity({ subject: organizerId }).mutation(api.purchases.undoSale, {
        eventProductId: epId,
      })
    ).rejects.toThrow('nicht als verkauft markiert');

    // 6. getPurchasesForEvent - Not authorized
    await expect(
      t
        .withIdentity({ subject: otherUserId })
        .query(api.purchases.getPurchasesForEvent, { eventId })
    ).rejects.toThrow('Not authorized');
  });

  test('markAllVendorProductsAvailable', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Organizer', email: 'org@test.com' });
    });
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Vendor', email: 'v@test.com' });
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
    await t.run(async (ctx) => {
      await ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' });
    });

    // 3 Products for this vendor
    await t.run(async (ctx) => {
      for (let i = 0; i < 3; i++) {
        const pid = await ctx.db.insert('products', {
          title: 'P' + i,
          description: 'D',
          price: 10,
          productCategory: categoryId,
          images: [],
          vendorId: vendorId,
          readyForSale: true,
          sold: false,
          condition: 'new',
          updatedAt: Date.now(),
        });
        await ctx.db.insert('eventProducts', { eventId, productId: pid, status: 'announced' });
      }
    });

    await t
      .withIdentity({ subject: organizerId })
      .mutation(api.eventProducts.markAllVendorProductsAvailable, {
        eventId,
        vendorId,
      });

    const eps = await t.run(async (ctx) => {
      return await ctx.db
        .query('eventProducts')
        .filter((q) => q.eq(q.field('eventId'), eventId))
        .collect();
    });
    expect(eps.every((e) => e.status === 'available')).toBe(true);
  });
});
