import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import { api } from '../_generated/api';
import schema from '../schema';

test('updateProductDiscount and sellProduct with discount', async () => {
  const t = convexTest(schema);
  const sellerId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', {
      name: 'Seller',
      email: 'seller@example.com',
      systemRole: 'user',
    });
  });
  const organizerId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', {
      name: 'Organizer',
      email: 'organizer@example.com',
      systemRole: 'admin',
    });
  });

  const categoryId = await t
    .withIdentity({ subject: organizerId })
    .mutation(api.categories.createCategory, { label: 'Test Category' });

  const now = Date.now();
  const eventId = await t.withIdentity({ subject: organizerId }).mutation(api.events.createEvent, {
    title: 'Ongoing Event',
    description: 'Test Event',
    location: 'Test Location',
    startDate: now - 1000 * 60 * 60, // 1 hour ago
    endDate: now + 1000 * 60 * 60, // in 1 hour
    contactInfo: 'test@test.com',
    categories: [categoryId],
    services: [],
    visibility: 'public',
    commission: 10,
  });

  const productId = await t.withIdentity({ subject: sellerId }).mutation(api.products.addProduct, {
    title: 'Discounted Product',
    vendorId: sellerId,
    description: 'A test product',
    condition: 'new',
    images: [],
    productCategory: categoryId,
    price: 100,
    readyForSale: true,
    sold: false,
  });

  await t.withIdentity({ subject: sellerId }).mutation(api.eventProducts.addProductToEvent, {
    eventId,
    productId,
  });

  const epInitial = await t
    .withIdentity({ subject: organizerId })
    .query(api.eventProducts.getEventProduct, { eventId, productId });

  // Mark as available so discount can be set
  await t.withIdentity({ subject: organizerId }).mutation(api.eventProducts.updateProductStatus, {
    eventProductId: epInitial!._id,
    status: 'available',
  });

  // Apply discount
  await t.withIdentity({ subject: sellerId }).mutation(api.eventProducts.updateProductDiscount, {
    eventId,
    productId,
    discountPercent: 20,
  });

  // Test Queries return discount
  const ep = await t
    .withIdentity({ subject: organizerId })
    .query(api.eventProducts.getEventProduct, { eventId, productId });
  expect(ep?.discountPercent).toBe(20);

  const products = await t
    .withIdentity({ subject: sellerId })
    .query(api.eventProducts.getProductsForEvent, { eventId });
  const product = products.find((p) => p._id === productId);
  expect(product?.discountPercent).toBe(20);

  const managementProducts = await t
    .withIdentity({ subject: organizerId })
    .query(api.eventProducts.getProductsForEventManagement, { eventId });
  const mgmtProduct = managementProducts.find((p) => p._id === productId);
  expect(mgmtProduct?.discountPercent).toBe(20);

  const statuses = await t
    .withIdentity({ subject: sellerId })
    .query(api.eventProducts.getMyEventProductStatuses, { eventId });
  const status = statuses.find((s) => s.productId === productId);
  expect(status?.discountPercent).toBe(20);

  const detailedProduct = await t
    .withIdentity({ subject: sellerId })
    .query(api.products.getProduct, { productId });
  expect(detailedProduct?.discountPercent).toBe(20);

  // Sell product
  const purchaseId = await t
    .withIdentity({ subject: organizerId })
    .mutation(api.purchases.sellProduct, {
      eventProductId: ep!._id,
    });

  const purchase = await t
    .withIdentity({ subject: organizerId })
    .query(api.purchases.getPurchasesForEvent, { eventId });
  const myPurchase = purchase.find((p) => p._id === purchaseId);

  // 100 - 20% = 80
  // Commission 10% of 80 = 8
  // Payout 80 - 8 = 72
  expect(myPurchase?.totalAmount).toBe(80);
  expect(myPurchase?.comissionAmount).toBe(8);
  expect(myPurchase?.payoutAmount).toBe(72);
});

test('updateProductDiscount constraints', async () => {
  const t = convexTest(schema);
  const sellerId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', {
      name: 'Seller',
      email: 'seller@example.com',
      systemRole: 'user',
    });
  });
  const otherUserId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', {
      name: 'Other',
      email: 'other@example.com',
      systemRole: 'user',
    });
  });
  const organizerId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', {
      name: 'Organizer',
      email: 'organizer@example.com',
      systemRole: 'admin',
    });
  });
  const categoryId = await t
    .withIdentity({ subject: organizerId })
    .mutation(api.categories.createCategory, { label: 'Test Category' });

  const now = Date.now();

  // Future event
  const futureEventId = await t
    .withIdentity({ subject: organizerId })
    .mutation(api.events.createEvent, {
      title: 'Future Event',
      description: 'Test Event',
      location: 'Test Location',
      startDate: now + 1000 * 60 * 60,
      endDate: now + 2000 * 60 * 60,
      contactInfo: 'test@test.com',
      categories: [categoryId],
      services: [],
      visibility: 'public',
      commission: 10,
    });

  const productId = await t.withIdentity({ subject: sellerId }).mutation(api.products.addProduct, {
    title: 'Test Product',
    vendorId: sellerId,
    description: 'A test product',
    condition: 'new',
    images: [],
    productCategory: categoryId,
    price: 100,
    readyForSale: true,
    sold: false,
  });

  await t.withIdentity({ subject: sellerId }).mutation(api.eventProducts.addProductToEvent, {
    eventId: futureEventId,
    productId,
  });

  // Fail if event not ongoing
  await expect(
    t.withIdentity({ subject: sellerId }).mutation(api.eventProducts.updateProductDiscount, {
      eventId: futureEventId,
      productId,
      discountPercent: 20,
    })
  ).rejects.toThrow('Rabatte können nur während einer laufenden Veranstaltung angepasst werden');

  // Ongoing event but wrong user
  const ongoingEventId = await t
    .withIdentity({ subject: organizerId })
    .mutation(api.events.createEvent, {
      title: 'Ongoing Event',
      description: 'Test Event',
      location: 'Test Location',
      startDate: now - 1000 * 60 * 60,
      endDate: now + 1000 * 60 * 60,
      contactInfo: 'test@test.com',
      categories: [categoryId],
      services: [],
      visibility: 'public',
      commission: 10,
    });

  await t.withIdentity({ subject: sellerId }).mutation(api.eventProducts.addProductToEvent, {
    eventId: ongoingEventId,
    productId,
  });

  await expect(
    t.withIdentity({ subject: otherUserId }).mutation(api.eventProducts.updateProductDiscount, {
      eventId: ongoingEventId,
      productId,
      discountPercent: 20,
    })
  ).rejects.toThrow('Not authorized to update this product');

  // Fail if product is still 'announced'
  await expect(
    t.withIdentity({ subject: sellerId }).mutation(api.eventProducts.updateProductDiscount, {
      eventId: ongoingEventId,
      productId,
      discountPercent: 20,
    })
  ).rejects.toThrow('Rabatte können nur für verfügbare Produkte festgelegt werden.');

  // Mark available
  const ep = await t
    .withIdentity({ subject: organizerId })
    .query(api.eventProducts.getEventProduct, { eventId: ongoingEventId, productId });
  await t.withIdentity({ subject: organizerId }).mutation(api.eventProducts.updateProductStatus, {
    eventProductId: ep!._id,
    status: 'available',
  });

  // Fail if discount > 50%
  await expect(
    t.withIdentity({ subject: sellerId }).mutation(api.eventProducts.updateProductDiscount, {
      eventId: ongoingEventId,
      productId,
      discountPercent: 60,
    })
  ).rejects.toThrow('Maximaler Rabatt ist 50%');

  // Fail if sold (will fail due to status check now)
  await t.run(async (ctx) => {
    await ctx.db.patch(ep!._id, { status: 'sold' });
  });
  await expect(
    t.withIdentity({ subject: sellerId }).mutation(api.eventProducts.updateProductDiscount, {
      eventId: ongoingEventId,
      productId,
      discountPercent: 10,
    })
  ).rejects.toThrow('Rabatte können nur für verfügbare Produkte festgelegt werden.');
});
