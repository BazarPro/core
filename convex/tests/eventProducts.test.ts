import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api } from '../_generated/api';
import { EventServices } from '../constants';
import { Id } from '../_generated/dataModel';

type ConvexTestInstance = ReturnType<typeof convexTest>;

async function createTestEvent(
  t: ConvexTestInstance,
  userId: Id<'users'>,
  overrides?: Partial<{
    title: string;
    description: string;
    location: string;
    startDate: number;
    endDate: number;
    categories: Id<'categories'>[];
    services: EventServices[];
    contactInfo: string;
    commission: number;
    visibility: 'public' | 'logged-in' | 'approved';
  }>
): Promise<Id<'events'>> {
  const category = await t
    .withIdentity({ subject: userId })
    .mutation(api.categories.createCategory, {
      label: 'Music',
    });
  return await t.withIdentity({ subject: userId }).mutation(api.events.createEvent, {
    title: 'Test Event',
    description: 'Test Description',
    location: 'Test Location',
    startDate: Date.now() + 1000000,
    endDate: Date.now() + 2000000,
    categories: [category],
    services: [],
    contactInfo: 'test@test.de',
    commission: 10,
    visibility: 'public',
    ...overrides,
  });
}
describe('Convex EventProducts Tests', () => {
  test('addProductToEvent happy path', async () => {
    const t = convexTest(schema);

    // Setup User
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Vendor',
        email: 'vendor@example.com',
        systemRole: 'admin',
      });
    });

    // Setup User
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Organizer', email: 'org@example.com' });
    });

    const category = await t
      .withIdentity({ subject: vendorId })
      .mutation(api.categories.createCategory, {
        label: 'Misc',
      });

    // Create Product
    const productId = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'Product 1',
        description: 'Desc',
        productCategory: category,
        images: [],
        price: 100,
        vendorId,
        sold: false,
        readyForSale: true,
        condition: 'new',
        updatedAt: Date.now(),
      });
    });

    // Create Event
    const eventId = await t.run(async (ctx) => {
      return await ctx.db.insert('events', {
        title: 'Event 1',
        description: 'Desc',
        location: 'Loc',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        contactInfo: 'Info',
        commission: 10,
        services: [],
        visibility: 'public',
        organizerId,
      });
    });

    // Vendor adds product to event
    await t.withIdentity({ subject: vendorId }).mutation(api.eventProducts.addProductToEvent, {
      eventId,
      productId,
    });

    // Verify
    const relations = await t.query(api.eventProducts.getProductIdsForEvent, { eventId });
    expect(relations).toContain(productId);
  });

  test('addProductToEvent returns existing if already added', async () => {
    const t = convexTest(schema);
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Vendor',
        email: 'v@e.com',
        systemRole: 'admin',
      });
    });
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Organizer', email: 'o@e.com' });
    });

    const category = await t
      .withIdentity({ subject: vendorId })
      .mutation(api.categories.createCategory, {
        label: 'Misc',
      });

    const productId = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'P1',
        description: '',
        productCategory: category,
        images: [],
        price: 10,
        vendorId,
        sold: false,
        readyForSale: true,
        condition: 'new',
        updatedAt: Date.now(),
      });
    });
    const eventId = await t.run(async (ctx) => {
      return await ctx.db.insert('events', {
        title: 'E1',
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        contactInfo: '',
        commission: 0,
        services: [],
        visibility: 'public',
        organizerId,
      });
    });

    // Add first time
    const id1 = await t
      .withIdentity({ subject: vendorId })
      .mutation(api.eventProducts.addProductToEvent, {
        eventId,
        productId,
      });

    // Add second time
    const id2 = await t
      .withIdentity({ subject: vendorId })
      .mutation(api.eventProducts.addProductToEvent, {
        eventId,
        productId,
      });

    expect(id1).toBe(id2);
  });

  test('getMyEventProductStatuses throws when unauthenticated', async () => {
    const t = convexTest(schema);
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Vendor',
        email: 'vendor-status@example.com',
        systemRole: 'admin',
      });
    });
    const eventId = await createTestEvent(t, vendorId);

    await expect(t.query(api.eventProducts.getMyEventProductStatuses, { eventId })).rejects.toThrow(
      'Not authenticated'
    );
  });

  test('getMyEventProductStatuses returns only vendor products and skips missing', async () => {
    const t = convexTest(schema);

    const vendorA = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Vendor A',
        email: 'vendor-a@example.com',
        systemRole: 'admin',
      });
    });
    const vendorB = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Vendor B',
        email: 'vendor-b@example.com',
        systemRole: 'admin',
      });
    });

    const eventId = await createTestEvent(t, vendorA);
    const category = await t
      .withIdentity({ subject: vendorA })
      .mutation(api.categories.createCategory, { label: 'Status' });

    const productA = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'Product A',
        description: 'Desc',
        productCategory: category,
        images: [],
        price: 10,
        vendorId: vendorA,
        sold: false,
        readyForSale: true,
        condition: 'new',
        updatedAt: Date.now(),
      });
    });
    const productB = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'Product B',
        description: 'Desc',
        productCategory: category,
        images: [],
        price: 10,
        vendorId: vendorB,
        sold: false,
        readyForSale: true,
        condition: 'new',
        updatedAt: Date.now(),
      });
    });
    const productDeleted = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'Product Deleted',
        description: 'Desc',
        productCategory: category,
        images: [],
        price: 10,
        vendorId: vendorA,
        sold: false,
        readyForSale: true,
        condition: 'new',
        updatedAt: Date.now(),
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert('eventProducts', {
        eventId,
        productId: productA,
        status: 'announced',
      });
      await ctx.db.insert('eventProducts', {
        eventId,
        productId: productB,
        status: 'announced',
      });
      await ctx.db.insert('eventProducts', {
        eventId,
        productId: productDeleted,
        status: 'announced',
      });
      await ctx.db.delete(productDeleted);
    });

    const results = await t
      .withIdentity({ subject: vendorA })
      .query(api.eventProducts.getMyEventProductStatuses, { eventId });

    expect(results.length).toBe(1);
    expect(results[0].productId).toBe(productA);
  });

  test('addProductToEvent errors', async () => {
    const t = convexTest(schema);
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Vendor',
        email: 'v@e.com',
        systemRole: 'admin',
      });
    });
    const otherUserId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Other', email: 'o@e.com' });
    });
    const category = await t
      .withIdentity({ subject: vendorId })
      .mutation(api.categories.createCategory, {
        label: 'Misc',
      });
    const productId = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'P1',
        description: '',
        productCategory: category,
        images: [],
        price: 10,
        vendorId,
        sold: false,
        readyForSale: true,
        condition: 'new',
        updatedAt: Date.now(),
      });
    });
    // Dummy event ID
    const eventId = await t.run(async (ctx) => {
      return await ctx.db.insert('events', {
        title: 'E1',
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        contactInfo: '',
        commission: 0,
        services: [],
        visibility: 'public',
        organizerId: otherUserId,
      });
    });

    // Not authenticated
    await expect(
      t.mutation(api.eventProducts.addProductToEvent, { eventId, productId })
    ).rejects.toThrow('Not authenticated');

    // Not authorized
    await expect(
      t
        .withIdentity({ subject: otherUserId })
        .mutation(api.eventProducts.addProductToEvent, { eventId, productId })
    ).rejects.toThrow('Not authorized to add this product to event');

    // Product not found
    await t.run(async (ctx) => await ctx.db.delete(productId));
    await expect(
      t
        .withIdentity({ subject: vendorId })
        .mutation(api.eventProducts.addProductToEvent, { eventId, productId })
    ).rejects.toThrow('Product not found');
  });

  test('removeProductFromEvent happy path', async () => {
    const t = convexTest(schema);
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Vendor',
        email: 'v@e.com',
        systemRole: 'admin',
      });
    });

    const category = await t
      .withIdentity({ subject: vendorId })
      .mutation(api.categories.createCategory, {
        label: 'Misc',
      });

    const productId = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'P1',
        description: '',
        productCategory: category,
        images: [],
        price: 10,
        vendorId,
        sold: false,
        readyForSale: true,
        condition: 'new',
        updatedAt: Date.now(),
      });
    });
    const eventId = await t.run(async (ctx) => {
      return await ctx.db.insert('events', {
        title: 'E1',
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        contactInfo: '',
        commission: 0,
        services: [],
        visibility: 'public',
        organizerId: vendorId,
      });
    });

    // Add relation manually
    await t.run(async (ctx) => {
      await ctx.db.insert('eventProducts', {
        eventId: eventId,
        productId: productId,
        status: 'announced',
      });
    });

    // Remove
    await t.withIdentity({ subject: vendorId }).mutation(api.eventProducts.removeProductFromEvent, {
      eventId,
      productId,
    });

    // Verify
    const relations = await t.query(api.eventProducts.getProductIdsForEvent, { eventId });
    expect(relations).toHaveLength(0);
  });

  test('removeProductFromEvent errors', async () => {
    const t = convexTest(schema);
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Vendor',
        email: 'v@e.com',
        systemRole: 'admin',
      });
    });
    const otherUserId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Other', email: 'o@e.com' });
    });
    const category = await t
      .withIdentity({ subject: vendorId })
      .mutation(api.categories.createCategory, {
        label: 'Misc',
      });
    const productId = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'P1',
        description: '',
        productCategory: category,
        images: [],
        price: 10,
        vendorId,
        sold: false,
        readyForSale: true,
        condition: 'new',
        updatedAt: Date.now(),
      });
    });
    const eventId = await t.run(async (ctx) => {
      return await ctx.db.insert('events', {
        title: 'E1',
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        contactInfo: '',
        commission: 0,
        services: [],
        visibility: 'public',
        organizerId: vendorId,
      });
    });

    // Not authenticated
    await expect(
      t.mutation(api.eventProducts.removeProductFromEvent, { eventId, productId })
    ).rejects.toThrow('Not authenticated');

    // Not authorized
    await expect(
      t
        .withIdentity({ subject: otherUserId })
        .mutation(api.eventProducts.removeProductFromEvent, { eventId, productId })
    ).rejects.toThrow('Not authorized to remove this product from event');

    // Product not found
    await t.run(async (ctx) => await ctx.db.delete(productId));
    await expect(
      t
        .withIdentity({ subject: vendorId })
        .mutation(api.eventProducts.removeProductFromEvent, { eventId, productId })
    ).rejects.toThrow('Product not found');
  });

  test('setProductEvents happy path', async () => {
    const t = convexTest(schema);
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Vendor',
        email: 'v@e.com',
        systemRole: 'admin',
      });
    });
    const category = await t
      .withIdentity({ subject: vendorId })
      .mutation(api.categories.createCategory, {
        label: 'Misc',
      });
    const productId = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'P1',
        description: '',
        productCategory: category,
        images: [],
        price: 10,
        vendorId,
        sold: false,
        readyForSale: true,
        condition: 'new',
        updatedAt: Date.now(),
      });
    });
    const event1 = await t.run(async (ctx) => {
      return await ctx.db.insert('events', {
        title: 'E1',
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        contactInfo: '',
        commission: 0,
        services: [],
        visibility: 'public',
        organizerId: vendorId,
      });
    });
    const event2 = await t.run(async (ctx) => {
      return await ctx.db.insert('events', {
        title: 'E2',
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        contactInfo: '',
        commission: 0,
        services: [],
        visibility: 'public',
        organizerId: vendorId,
      });
    });

    // Initially linked to E1
    await t.run(async (ctx) => {
      await ctx.db.insert('eventProducts', { status: 'announced', eventId: event1, productId });
    });

    // Set to E2
    await t.withIdentity({ subject: vendorId }).mutation(api.eventProducts.setProductEvents, {
      status: 'announced',
      productId: productId,
      eventIds: [event2],
    });

    const relations = await t.query(api.eventProducts.getEventIdsForProduct, { productId });
    expect(relations).toContain(event2);
    expect(relations).not.toContain(event1);
    expect(relations).toHaveLength(1);
  });

  test('setProductEvents errors', async () => {
    const t = convexTest(schema);
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Vendor',
        email: 'v@e.com',
        systemRole: 'admin',
      });
    });
    const otherUserId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Other', email: 'o@e.com' });
    });
    const category = await t
      .withIdentity({ subject: vendorId })
      .mutation(api.categories.createCategory, {
        label: 'Misc',
      });
    const productId = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'P1',
        description: '',
        productCategory: category,
        images: [],
        price: 10,
        vendorId,
        sold: false,
        readyForSale: true,
        condition: 'new',
        updatedAt: Date.now(),
      });
    });

    // Not authenticated
    await expect(
      t.mutation(api.eventProducts.setProductEvents, {
        status: 'announced',
        productId: productId,
        eventIds: [],
      })
    ).rejects.toThrow('Not authenticated');

    // Not authorized
    await expect(
      t.withIdentity({ subject: otherUserId }).mutation(api.eventProducts.setProductEvents, {
        status: 'announced',
        productId,
        eventIds: [],
      })
    ).rejects.toThrow('Not authorized to modify this product');

    // Product not found
    await t.run(async (ctx) => await ctx.db.delete(productId));
    await expect(
      t.withIdentity({ subject: vendorId }).mutation(api.eventProducts.setProductEvents, {
        status: 'announced',
        productId,
        eventIds: [],
      })
    ).rejects.toThrow('Product not found');
  });

  test('setProductEvents handles missing events gracefully', async () => {
    const t = convexTest(schema);
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Vendor',
        email: 'v@e.com',
        systemRole: 'admin',
      });
    });
    const category = await t
      .withIdentity({ subject: vendorId })
      .mutation(api.categories.createCategory, {
        label: 'Misc',
      });
    const productId = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'P1',
        description: '',
        productCategory: category,
        images: [],
        price: 10,
        vendorId,
        sold: false,
        readyForSale: true,
        condition: 'new',
        updatedAt: Date.now(),
      });
    });

    const deletedEventId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('events', {
        title: 'Temp',
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        contactInfo: '',
        commission: 0,
        services: [],
        visibility: 'public',
        organizerId: vendorId,
      });
      await ctx.db.delete(id);
      return id;
    });

    await t.withIdentity({ subject: vendorId }).mutation(api.eventProducts.setProductEvents, {
      status: 'announced',
      productId,
      eventIds: [deletedEventId],
    });

    const relations = await t.query(api.eventProducts.getEventIdsForProduct, { productId });
    expect(relations).toHaveLength(0);
  });

  test('Unauthenticated user only sees readyForSale products in event', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Vendor',
        email: 'v@e.com',
        systemRole: 'admin',
      });
    });

    // Create event
    const eventId = await createTestEvent(t, userId);

    // Public Product
    const category = await t
      .withIdentity({ subject: userId })
      .mutation(api.categories.createCategory, {
        label: 'Misc',
      });

    const productAId = await t.withIdentity({ subject: userId }).mutation(api.products.addProduct, {
      title: 'Public Item',
      description: '...',
      price: 10,
      productCategory: category,
      images: [],
      vendorId: userId,
      sold: false,
      readyForSale: true,
      condition: 'new',
    });

    // Draft Product
    const productBId = await t.withIdentity({ subject: userId }).mutation(api.products.addProduct, {
      title: 'Draft Item',
      description: '...',
      price: 10,
      productCategory: category,
      images: [],
      vendorId: userId,
      sold: false,
      readyForSale: false,
      condition: 'new',
    });

    //add products to event
    await t.withIdentity({ subject: userId }).mutation(api.eventProducts.addProductToEvent, {
      eventId: eventId,
      productId: productAId,
      status: 'announced',
    });

    await t.withIdentity({ subject: userId }).mutation(api.eventProducts.addProductToEvent, {
      eventId: eventId,
      productId: productBId,
      status: 'announced',
    });

    // Unauthenticated query
    const products = await t.query(api.eventProducts.getProductsForEvent, { eventId });
    expect(products).toHaveLength(1);
    expect(products[0]?.title).toBe('Public Item');
  });

  test('Authenticated user sees their own draft products in event', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Vendor',
        email: 'v@e.com',
        systemRole: 'admin',
      });
    });

    // Create event
    const eventId = await createTestEvent(t, userId);

    // Draft Product
    const category = await t
      .withIdentity({ subject: userId })
      .mutation(api.categories.createCategory, {
        label: 'Misc',
      });

    const productId = await t.withIdentity({ subject: userId }).mutation(api.products.addProduct, {
      title: 'My Draft Item',
      description: '...',
      price: 10,
      productCategory: category,
      images: [],
      vendorId: userId,
      sold: false,
      readyForSale: false,
      condition: 'new',
    });

    //add products to event
    await t.withIdentity({ subject: userId }).mutation(api.eventProducts.addProductToEvent, {
      eventId: eventId,
      productId: productId,
      status: 'announced',
    });

    // Authenticated query as the vendor
    const products = await t
      .withIdentity({ subject: userId })
      .query(api.eventProducts.getProductsForEvent, { eventId });
    expect(products).toHaveLength(1);
    expect(products[0]?.title).toBe('My Draft Item');
  });

  test('Authenticated user does NOT see other users draft products in event', async () => {
    const t = convexTest(schema);
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Vendor',
        email: 'v@e.com',
        systemRole: 'admin',
      });
    });
    const otherUserId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Other', email: 'o@e.com', systemRole: 'admin' });
    });

    // Create event
    const eventId = await createTestEvent(t, vendorId);

    // Vendor's Product (not ready for sale )
    const category = await t
      .withIdentity({ subject: vendorId })
      .mutation(api.categories.createCategory, {
        label: 'Misc',
      });

    const productId = await t
      .withIdentity({ subject: vendorId })
      .mutation(api.products.addProduct, {
        title: 'Vendor Draft',
        description: '...',
        price: 10,
        productCategory: category,
        images: [],
        vendorId: vendorId,
        sold: false,
        readyForSale: false,
        condition: 'new',
      });

    //add products to event
    await t.withIdentity({ subject: vendorId }).mutation(api.eventProducts.addProductToEvent, {
      eventId: eventId,
      productId: productId,
      status: 'announced',
    });

    // Authenticated query as Other User
    const products = await t
      .withIdentity({ subject: otherUserId })
      .query(api.eventProducts.getProductsForEvent, { eventId });
    expect(products).toHaveLength(0);
  });

  test('Can filter products by event ID', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Vendor',
        email: 'v@e.com',
        systemRole: 'admin',
      });
    });

    // Create events
    const eventAId = await createTestEvent(t, userId, { title: 'Event A' });
    const eventBId = await createTestEvent(t, userId, { title: 'Event B' });
    const category = await t
      .withIdentity({ subject: userId })
      .mutation(api.categories.createCategory, {
        label: 'Merch',
      });
    // Product for Event A
    const productAId = await t.withIdentity({ subject: userId }).mutation(api.products.addProduct, {
      title: 'Event A T-Shirt',
      description: '...',
      price: 20,
      productCategory: category,
      images: [],
      vendorId: userId,
      readyForSale: true,
      sold: false,
      condition: 'new',
    });

    await t.withIdentity({ subject: userId }).mutation(api.eventProducts.addProductToEvent, {
      eventId: eventAId,
      productId: productAId,
      status: 'available',
    });

    // Product for Event B
    const productBId = await t.withIdentity({ subject: userId }).mutation(api.products.addProduct, {
      title: 'Event B Mug',
      description: '...',
      price: 10,
      productCategory: category,
      images: [],
      vendorId: userId,
      readyForSale: true,
      sold: false,
      condition: 'new',
    });
    await t.withIdentity({ subject: userId }).mutation(api.eventProducts.addProductToEvent, {
      eventId: eventBId,
      productId: productBId,
      status: 'available',
    });

    // Product for both Events
    const productCId = await t.withIdentity({ subject: userId }).mutation(api.products.addProduct, {
      title: 'General Sticker',
      description: '...',
      price: 2,
      productCategory: category,
      images: [],
      vendorId: userId,
      readyForSale: true,
      sold: false,
      condition: 'new',
    });

    await t.withIdentity({ subject: userId }).mutation(api.eventProducts.addProductToEvent, {
      eventId: eventAId,
      productId: productCId,
      status: 'available',
    });

    await t.withIdentity({ subject: userId }).mutation(api.eventProducts.addProductToEvent, {
      eventId: eventBId,
      productId: productCId,
      status: 'available',
    });

    // Test Filter for Event A
    const eventAProducts = await t.query(api.eventProducts.getProductsForEvent, {
      eventId: eventAId,
    });
    expect(eventAProducts).toHaveLength(2);
    expect(eventAProducts.map((p) => p?.title)).toContain('Event A T-Shirt');
    expect(eventAProducts.map((p) => p?.title)).toContain('General Sticker');

    // Test Filter for Event B
    const eventBProducts = await t.query(api.eventProducts.getProductsForEvent, {
      eventId: eventBId,
    });
    expect(eventBProducts).toHaveLength(2);
    expect(eventBProducts.map((p) => p?.title)).toContain('Event B Mug');
    expect(eventAProducts.map((p) => p?.title)).toContain('General Sticker');
  });

  test('markAllVendorProductsAvailable sets all announced products to available', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Org' }));
    const vendorId = await t.run((ctx) => ctx.db.insert('users', { name: 'Vendor' }));

    const eventId = await t.run((ctx) =>
      ctx.db.insert('events', {
        title: 'Event',
        organizerId,
        commission: 10,
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        contactInfo: '',
        services: [],
        visibility: 'public',
      })
    );
    await t.run((ctx) =>
      ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' })
    );

    const category = await t.run((ctx) =>
      ctx.db.insert('categories', { label: 'X', updatedAt: 0 })
    );

    const p1 = await t.run((ctx) =>
      ctx.db.insert('products', {
        title: 'P1',
        vendorId,
        productCategory: category,
        price: 10,
        sold: false,
        readyForSale: true,
        condition: 'new',
        updatedAt: 0,
        description: '',
        images: [],
      })
    );
    const p2 = await t.run((ctx) =>
      ctx.db.insert('products', {
        title: 'P2',
        vendorId,
        productCategory: category,
        price: 20,
        sold: false,
        readyForSale: true,
        condition: 'new',
        updatedAt: 0,
        description: '',
        images: [],
      })
    );

    await t.run((ctx) =>
      ctx.db.insert('eventProducts', { eventId, productId: p1, status: 'announced' })
    );
    await t.run((ctx) =>
      ctx.db.insert('eventProducts', { eventId, productId: p2, status: 'announced' })
    );

    await t
      .withIdentity({ subject: organizerId })
      .mutation(api.eventProducts.markAllVendorProductsAvailable, {
        eventId,
        vendorId,
      });

    const products = await t.query(api.eventProducts.getProductsForEvent, { eventId });
    expect(products.every((p) => p.status === 'available')).toBe(true);
  });

  test('markAllVendorProductsReturned sets all available products to returned', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Org' }));
    const vendorId = await t.run((ctx) => ctx.db.insert('users', { name: 'Vendor' }));

    const eventId = await t.run((ctx) =>
      ctx.db.insert('events', {
        title: 'Event',
        organizerId,
        commission: 10,
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        contactInfo: '',
        services: [],
        visibility: 'public',
      })
    );
    await t.run((ctx) =>
      ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' })
    );

    const category = await t.run((ctx) =>
      ctx.db.insert('categories', { label: 'X', updatedAt: 0 })
    );

    const p1 = await t.run((ctx) =>
      ctx.db.insert('products', {
        title: 'P1',
        vendorId,
        productCategory: category,
        price: 10,
        sold: false,
        readyForSale: true,
        condition: 'new',
        updatedAt: 0,
        description: '',
        images: [],
      })
    );

    await t.run((ctx) =>
      ctx.db.insert('eventProducts', { eventId, productId: p1, status: 'available' })
    );

    await t
      .withIdentity({ subject: organizerId })
      .mutation(api.eventProducts.markAllVendorProductsReturned, {
        eventId,
        vendorId,
      });

    const ep = await t.run((ctx) =>
      ctx.db
        .query('eventProducts')
        .filter((q) => q.eq(q.field('productId'), p1))
        .first()
    );
    expect(ep?.status).toBe('returned');
  });

  test('getProductsForEventManagement requires organizer or helper', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Org' }));
    const otherId = await t.run((ctx) => ctx.db.insert('users', { name: 'Other' }));
    const eventId = await t.run((ctx) =>
      ctx.db.insert('events', {
        title: 'Event',
        organizerId,
        commission: 10,
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        contactInfo: '',
        services: [],
        visibility: 'public',
      })
    );
    await t.run((ctx) =>
      ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' })
    );

    const products = await t
      .withIdentity({ subject: organizerId })
      .query(api.eventProducts.getProductsForEventManagement, { eventId });
    expect(Array.isArray(products)).toBe(true);

    await expect(
      t
        .withIdentity({ subject: otherId })
        .query(api.eventProducts.getProductsForEventManagement, { eventId })
    ).rejects.toThrow('Not authorized');
  });

  test('getEventProduct requires organizer or helper', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Org' }));
    const vendorId = await t.run((ctx) => ctx.db.insert('users', { name: 'Vendor' }));
    const otherId = await t.run((ctx) => ctx.db.insert('users', { name: 'Other' }));

    const eventId = await t.run((ctx) =>
      ctx.db.insert('events', {
        title: 'Event',
        organizerId,
        commission: 10,
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        contactInfo: '',
        services: [],
        visibility: 'public',
      })
    );
    await t.run((ctx) =>
      ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' })
    );

    const categoryId = await t.run((ctx) =>
      ctx.db.insert('categories', { label: 'X', updatedAt: 0 })
    );
    const productId = await t.run((ctx) =>
      ctx.db.insert('products', {
        title: 'P',
        vendorId,
        productCategory: categoryId,
        price: 10,
        sold: false,
        readyForSale: true,
        condition: 'new',
        updatedAt: 0,
        description: '',
        images: [],
      })
    );
    await t.run((ctx) =>
      ctx.db.insert('eventProducts', { eventId, productId, status: 'announced' })
    );

    const ep = await t
      .withIdentity({ subject: organizerId })
      .query(api.eventProducts.getEventProduct, { eventId, productId });
    expect(ep?.product._id).toBe(productId);

    await expect(
      t
        .withIdentity({ subject: otherId })
        .query(api.eventProducts.getEventProduct, { eventId, productId })
    ).rejects.toThrow('Not authorized');
  });

  test('getEventProduct returns null for missing relations or products', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Org' }));
    const vendorId = await t.run((ctx) => ctx.db.insert('users', { name: 'Vendor' }));

    const eventId = await t.run((ctx) =>
      ctx.db.insert('events', {
        title: 'Event',
        organizerId,
        commission: 10,
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        contactInfo: '',
        services: [],
        visibility: 'public',
      })
    );
    await t.run((ctx) =>
      ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' })
    );

    const categoryId = await t.run((ctx) =>
      ctx.db.insert('categories', { label: 'X', updatedAt: 0 })
    );
    const productId = await t.run((ctx) =>
      ctx.db.insert('products', {
        title: 'P',
        vendorId,
        productCategory: categoryId,
        price: 10,
        sold: false,
        readyForSale: true,
        condition: 'new',
        updatedAt: 0,
        description: '',
        images: [],
      })
    );

    const missingRel = await t
      .withIdentity({ subject: organizerId })
      .query(api.eventProducts.getEventProduct, { eventId, productId });
    expect(missingRel).toBeNull();

    const relId = await t.run((ctx) =>
      ctx.db.insert('eventProducts', { eventId, productId, status: 'announced' })
    );
    await t.run((ctx) => ctx.db.delete(productId));

    const missingProduct = await t
      .withIdentity({ subject: organizerId })
      .query(api.eventProducts.getEventProduct, { eventId, productId });
    expect(missingProduct).toBeNull();

    await t.run((ctx) => ctx.db.delete(relId));
  });

  test('getProductsForEventManagement skips missing products', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Org' }));
    const vendorId = await t.run((ctx) => ctx.db.insert('users', { name: 'Vendor' }));
    const eventId = await t.run((ctx) =>
      ctx.db.insert('events', {
        title: 'Event',
        organizerId,
        commission: 10,
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        contactInfo: '',
        services: [],
        visibility: 'public',
      })
    );
    await t.run((ctx) =>
      ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' })
    );

    const categoryId = await t.run((ctx) =>
      ctx.db.insert('categories', { label: 'X', updatedAt: 0 })
    );
    const productId = await t.run((ctx) =>
      ctx.db.insert('products', {
        title: 'P',
        vendorId,
        productCategory: categoryId,
        price: 10,
        sold: false,
        readyForSale: true,
        condition: 'new',
        updatedAt: 0,
        description: '',
        images: [],
      })
    );
    const relId = await t.run((ctx) =>
      ctx.db.insert('eventProducts', { eventId, productId, status: 'announced' })
    );
    await t.run((ctx) => ctx.db.delete(productId));

    const products = await t
      .withIdentity({ subject: organizerId })
      .query(api.eventProducts.getProductsForEventManagement, { eventId });
    expect(products).toHaveLength(0);

    await t.run((ctx) => ctx.db.delete(relId));
  });

  test('event product auth and undoReturn branches', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Org' }));
    const helperId = await t.run((ctx) => ctx.db.insert('users', { name: 'Helper' }));
    const otherId = await t.run((ctx) => ctx.db.insert('users', { name: 'Other' }));
    const vendorId = await t.run((ctx) => ctx.db.insert('users', { name: 'Vendor' }));

    const eventId = await t.run((ctx) =>
      ctx.db.insert('events', {
        title: 'Event',
        organizerId,
        commission: 10,
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        contactInfo: '',
        services: [],
        visibility: 'public',
      })
    );
    await t.run((ctx) => {
      return Promise.all([
        ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' }),
        ctx.db.insert('eventRole', { event: eventId, user: helperId, roles: 'coorganizer' }),
      ]);
    });

    const categoryId = await t.run((ctx) =>
      ctx.db.insert('categories', { label: 'X', updatedAt: 0 })
    );
    const productId = await t.run((ctx) =>
      ctx.db.insert('products', {
        title: 'P',
        vendorId,
        productCategory: categoryId,
        price: 10,
        sold: false,
        readyForSale: true,
        condition: 'new',
        updatedAt: 0,
        description: '',
        images: [],
      })
    );
    const epId = await t.run((ctx) =>
      ctx.db.insert('eventProducts', { eventId, productId, status: 'returned' })
    );

    await expect(
      t.withIdentity({ subject: otherId }).mutation(api.eventProducts.updateProductStatus, {
        eventProductId: epId,
        status: 'available',
      })
    ).rejects.toThrow('Not authorized');

    await expect(
      t
        .withIdentity({ subject: otherId })
        .mutation(api.eventProducts.markAllVendorProductsAvailable, { eventId, vendorId })
    ).rejects.toThrow('Not authorized');

    await expect(
      t
        .withIdentity({ subject: otherId })
        .mutation(api.eventProducts.markAllVendorProductsReturned, { eventId, vendorId })
    ).rejects.toThrow('Not authorized');

    // undoReturn feature flag disabled
    await t.run((ctx) =>
      ctx.db.insert('featureFlags', { key: 'allow_undo_inventory_actions', value: false })
    );
    await expect(
      t.withIdentity({ subject: organizerId }).mutation(api.eventProducts.undoReturn, {
        eventProductId: epId,
      })
    ).rejects.toThrow('deaktiviert');

    // enable flag and test not authorized
    await t.run(async (ctx) => {
      const flag = await ctx.db
        .query('featureFlags')
        .withIndex('by_key', (q) => q.eq('key', 'allow_undo_inventory_actions'))
        .unique();
      if (flag) await ctx.db.patch(flag._id, { value: true });
    });
    await expect(
      t.withIdentity({ subject: otherId }).mutation(api.eventProducts.undoReturn, {
        eventProductId: epId,
      })
    ).rejects.toThrow('Not authorized');

    // wrong status branch
    await t.run((ctx) => ctx.db.patch(epId, { status: 'available' }));
    await expect(
      t.withIdentity({ subject: helperId }).mutation(api.eventProducts.undoReturn, {
        eventProductId: epId,
      })
    ).rejects.toThrow('nicht als zurückgegeben');
  });

  test('getEventLocationsForProduct returns locationLabel per event relation', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'O',
        email: `o-loc-${Date.now()}@test.com`,
        systemRole: 'admin',
      });
    });
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'V', email: `v-loc-${Date.now()}@test.com` });
    });
    const productCategoryId = await t.run(async (ctx) => {
      return await ctx.db.insert('categories', { label: 'G', updatedAt: Date.now() });
    });
    const eventA = await createTestEvent(t, organizerId, { title: 'EA' });
    const eventB = await createTestEvent(t, organizerId, { title: 'EB' });
    const locId = await t.run(async (ctx) => {
      return await ctx.db.insert('eventLocationCategories', {
        eventId: eventA,
        label: 'Row 1',
      });
    });
    const productId = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'P',
        description: 'D',
        price: 1,
        productCategory: productCategoryId,
        images: [],
        vendorId,
        readyForSale: true,
        sold: false,
        condition: 'new',
        updatedAt: Date.now(),
      });
    });
    await t.run(async (ctx) => {
      await ctx.db.insert('eventProducts', {
        eventId: eventA,
        productId,
        status: 'announced',
        locationCategoryId: locId,
      });
      await ctx.db.insert('eventProducts', {
        eventId: eventB,
        productId,
        status: 'announced',
      });
    });

    const rows = await t.query(api.eventProducts.getEventLocationsForProduct, { productId });
    expect(rows).toHaveLength(2);
    const byEvent = Object.fromEntries(rows.map((r) => [r.eventId, r.locationLabel]));
    expect(byEvent[eventA]).toBe('Row 1');
    expect(byEvent[eventB]).toBeUndefined();
  });
});
