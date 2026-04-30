import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { EventServices } from '../constants';

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

describe('Convex Products Tests', () => {
  describe('addProduct', () => {
    test('User can add a product', async () => {
      const t = convexTest(schema);

      // 1. Create a vendor (user) to satisfy v.id('users') constraint
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', {
          name: 'Vendor Bob',
          email: 'bob@vendor.com',
          systemRole: 'admin',
        });
      });

      // 2. Add a product
      const category = await t
        .withIdentity({ subject: userId })
        .mutation(api.categories.createCategory, {
          label: 'Instruments',
        });

      const productId = await t
        .withIdentity({ subject: userId })
        .mutation(api.products.addProduct, {
          title: 'Vintage Guitar',
          description: 'A beautiful stratocaster',
          price: 1500,
          productCategory: category,
          condition: 'ok',
          images: [],
          vendorId: userId,
          readyForSale: true,
          sold: false,
        });

      // 4. Verify it exists
      const products = await t.withIdentity({ subject: userId }).query(api.products.getMyProducts);
      expect(products).toHaveLength(1);
      expect(products[0].title).toBe('Vintage Guitar');
      expect(products[0].vendorId).toBe(userId);
      expect(productId).toBeDefined();
    });

    test('User cannot add a product for another user', async () => {
      const t = convexTest(schema);

      // 1. Create two users
      const userAId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', {
          name: 'Vendor A',
          email: 'vendorA@example.com',
          systemRole: 'admin',
        });
      });
      const userBId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', {
          name: 'Vendor B',
          email: 'vendorB@example.com',
        });
      });
      // 2. Try to add a product for User B while authenticated as User A
      const category = await t
        .withIdentity({ subject: userAId })
        .mutation(api.categories.createCategory, {
          label: 'Misc',
        });
      await expect(
        t.withIdentity({ subject: userAId }).mutation(api.products.addProduct, {
          title: 'Stolen Product',
          description: 'This should not be allowed',
          price: 100,
          productCategory: category,
          condition: 'ok',
          images: [],
          vendorId: userBId, // Attempting to create for User B
          readyForSale: true,
          sold: false,
        })
      ).rejects.toThrow('Cannot create product for another user');
    });
  });

  describe('getMyProducts', () => {
    test('getMyProducts happy path', async () => {
      const t = convexTest(schema);
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', { name: 'V', email: 'v@e.com', systemRole: 'admin' });
      });

      //create category
      const category = await t
        .withIdentity({ subject: userId })
        .mutation(api.categories.createCategory, {
          label: 'Misc',
        });

      //create product
      const productId = await t
        .withIdentity({ subject: userId })
        .mutation(api.products.addProduct, {
          title: 'P1',
          description: 'D1',
          price: 10,
          productCategory: category, //C
          images: [],
          vendorId: userId,
          sold: false,
          readyForSale: true,
          condition: 'new',
        });

      //create event
      const eventId = await createTestEvent(t, userId);
      await t
        .withIdentity({ subject: userId })
        .mutation(api.eventProducts.addProductToEvent, { productId: productId, eventId: eventId });

      const myProducts = await t
        .withIdentity({ subject: userId })
        .query(api.products.getMyProducts);

      expect(myProducts).toHaveLength(1);
      expect(myProducts[0]._id).toBe(productId);

      expect(myProducts[0].eventIds).toHaveLength(1);
      expect(myProducts[0].eventIds[0]).toBe(eventId.toString()); //Delete toString() when editing products.ts::getMyProducts
    });

    test('User cannot get products when unauthenticated', async () => {
      const t = convexTest(schema);

      await expect(t.query(api.products.getMyProducts)).rejects.toThrow('Not authenticated');
    });
  });

  describe('updateProduct', () => {
    test('User can update a product', async () => {
      const t = convexTest(schema);

      // 1. Setup User and Event
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', {
          name: 'Vendor Bob',
          email: 'bob@vendor.com',
          systemRole: 'admin',
        });
      });

      const category = await t
        .withIdentity({ subject: userId })
        .mutation(api.categories.createCategory, {
          label: 'Furniture',
        });
      const productId = await t
        .withIdentity({ subject: userId })
        .mutation(api.products.addProduct, {
          title: 'Old Chair',
          description: 'Sits well',
          price: 50,
          productCategory: category,
          condition: 'ok',
          images: [],
          vendorId: userId,
          readyForSale: true,
          sold: false,
        });

      // 2. Update the product
      await t.withIdentity({ subject: userId }).mutation(api.products.updateProduct, {
        productId: productId!,
        title: 'Antique Chair',
        description: 'Sits very well',
        price: 75,
        productCategory: category,
        condition: 'new',
        images: [],
        readyForSale: true,
      });

      // 3. Verify updates
      const updatedProduct = await t.query(api.products.getProduct, { productId: productId! });
      expect(updatedProduct).not.toBeNull();
      expect(updatedProduct?.title).toBe('Antique Chair');
      expect(updatedProduct?.price).toBe(75);
      expect(updatedProduct?.condition).toBe('new');
    });

    test('Cannot update non-existent product', async () => {
      const t = convexTest(schema);

      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', {
          name: 'Vendor',
          email: 'v@e.com',
          systemRole: 'admin',
        });
      });

      const category1 = await t
        .withIdentity({ subject: userId })
        .mutation(api.categories.createCategory, {
          label: 'Misc',
        });
      const category2 = await t
        .withIdentity({ subject: userId })
        .mutation(api.categories.createCategory, {
          label: 'None',
        });

      // Create product
      const productId = await t
        .withIdentity({ subject: userId })
        .mutation(api.products.addProduct, {
          title: 'Draft Product',
          description: '...',
          price: 100,
          productCategory: category1,
          images: [],
          vendorId: userId,
          readyForSale: true,
          condition: 'new',
          sold: false,
        });

      // Delete it
      await t
        .withIdentity({ subject: userId })
        .mutation(api.products.deleteProduct, { id: productId! });

      // Try to update it (authenticated)
      await expect(
        t.withIdentity({ subject: userId }).mutation(api.products.updateProduct, {
          productId: productId!,
          title: 'Should Fail',
          description: '...',
          price: 0,
          productCategory: category2,
          condition: 'new',
          images: [],
          readyForSale: true,
        })
      ).rejects.toThrow('Product not found');
    });

    test("User cannot update another user's product", async () => {
      const t = convexTest(schema);
      const userAId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', { name: 'A', systemRole: 'admin' });
      });
      const userBId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', { name: 'B' });
      });
      const category = await t
        .withIdentity({ subject: userAId })
        .mutation(api.categories.createCategory, { label: 'C' });
      const productId = await t
        .withIdentity({ subject: userAId })
        .mutation(api.products.addProduct, {
          title: 'P',
          description: '',
          price: 10,
          productCategory: category,
          condition: 'new',
          images: [],
          vendorId: userAId,
          readyForSale: true,
          sold: false,
        });

      await expect(
        t.withIdentity({ subject: userBId }).mutation(api.products.updateProduct, {
          productId,
          title: 'X',
          description: '',
          price: 10,
          productCategory: category,
          condition: 'new',
          images: [],
          readyForSale: true,
        })
      ).rejects.toThrow('Not authorized');
    });

    test('Cannot update locked product', async () => {
      const t = convexTest(schema);
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', { name: 'V', systemRole: 'admin' });
      });
      const category = await t
        .withIdentity({ subject: userId })
        .mutation(api.categories.createCategory, { label: 'C' });
      const productId = await t
        .withIdentity({ subject: userId })
        .mutation(api.products.addProduct, {
          title: 'P',
          description: '',
          price: 10,
          productCategory: category,
          condition: 'new',
          images: [],
          vendorId: userId,
          readyForSale: true,
          sold: false,
        });

      // Lock it by adding to event and setting status to 'available'
      const eventId = await createTestEvent(t, userId);
      await t
        .withIdentity({ subject: userId })
        .mutation(api.eventProducts.addProductToEvent, { eventId, productId });
      await t.withIdentity({ subject: userId }).mutation(api.eventProducts.updateProductStatus, {
        eventProductId: await t.run(
          async (ctx) => (await ctx.db.query('eventProducts').first())!._id
        ),
        status: 'available',
      });

      await expect(
        t.withIdentity({ subject: userId }).mutation(api.products.updateProduct, {
          productId,
          title: 'X',
          description: '',
          price: 10,
          productCategory: category,
          condition: 'new',
          images: [],
          readyForSale: true,
        })
      ).rejects.toThrow('locked');
    });
  });

  test('getProduct hides vendor name for non-organizers', async () => {
    const t = convexTest(schema);
    const vendorId = await t.run((ctx) =>
      ctx.db.insert('users', { name: 'Vendor Name', email: 'v@e.com' })
    );
    const organizerId = await t.run((ctx) =>
      ctx.db.insert('users', { name: 'Organizer', email: 'o@e.com' })
    );
    const categoryId = await t.run((ctx) =>
      ctx.db.insert('categories', { label: 'Cat', updatedAt: Date.now() })
    );
    const productId = await t.run((ctx) =>
      ctx.db.insert('products', {
        title: 'P',
        description: '',
        price: 10,
        productCategory: categoryId,
        images: [],
        vendorId,
        readyForSale: true,
        sold: false,
        condition: 'new',
        updatedAt: Date.now(),
      })
    );
    const eventId = await t.run((ctx) =>
      ctx.db.insert('events', {
        title: 'Event',
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [categoryId],
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
        ctx.db.insert('eventProducts', { eventId, productId, status: 'announced' }),
      ]);
    });

    const unauthProduct = await t.query(api.products.getProduct, { productId });
    expect(unauthProduct?.vendorFirstName).toBeUndefined();
    expect(unauthProduct?.vendorLastName).toBeUndefined();

    const organizerProduct = await t
      .withIdentity({ subject: organizerId })
      .query(api.products.getProduct, { productId });
    expect(organizerProduct?.vendorFirstName).toBe('Vendor Name');
  });

  describe('deleteProduct', () => {
    test('User can delete a product', async () => {
      const t = convexTest(schema);

      // 1. Setup
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', {
          name: 'Vendor',
          email: 'v@e.com',
          systemRole: 'admin',
        });
      });
      const category = await t
        .withIdentity({ subject: userId })
        .mutation(api.categories.createCategory, {
          label: 'Misc',
        });

      const productId = await t
        .withIdentity({ subject: userId })
        .mutation(api.products.addProduct, {
          title: 'To be deleted',
          description: '...',
          price: 10,
          productCategory: category,
          images: [],
          vendorId: userId,
          readyForSale: true,
          sold: false,
          condition: 'new',
        });

      // 2. Delete
      await t
        .withIdentity({ subject: userId })
        .mutation(api.products.deleteProduct, { id: productId! });

      // 3. Verify
      const remainingProducts = await t
        .withIdentity({ subject: userId })
        .query(api.products.getMyProducts);

      expect(remainingProducts).toHaveLength(0);
    });

    test("User cannot delete another user's product", async () => {
      const t = convexTest(schema);

      const userAId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', {
          name: 'Vendor A',
          email: 'vendora@example.com',
          systemRole: 'admin',
        });
      });

      const userBId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', {
          name: 'Vendor B',
          email: 'vendorb@example.com',
        });
      });

      const category = await t
        .withIdentity({ subject: userAId })
        .mutation(api.categories.createCategory, {
          label: 'Misc',
        });

      const productId = await t
        .withIdentity({ subject: userAId })
        .mutation(api.products.addProduct, {
          title: 'User A Product',
          description: 'Beschreibung',
          price: 100,
          productCategory: category,
          images: [],
          vendorId: userAId,
          readyForSale: true,
          condition: 'new',
          sold: false,
        });

      await expect(
        t.withIdentity({ subject: userBId }).mutation(api.products.deleteProduct, { id: productId })
      ).rejects.toThrow('Not authorized to delete this product');
    });

    test('eventProduct Relations get deleted when single Product is deleted', async () => {
      const t = convexTest(schema);

      // 1. Setup
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', {
          name: 'Vendor',
          email: 'v@e.com',
          systemRole: 'admin',
        });
      });
      const category = await t
        .withIdentity({ subject: userId })
        .mutation(api.categories.createCategory, {
          label: 'Misc',
        });

      const productId = await t
        .withIdentity({ subject: userId })
        .mutation(api.products.addProduct, {
          title: 'To be deleted',
          description: '...',
          price: 10,
          productCategory: category,
          images: [],
          vendorId: userId,
          readyForSale: true,
          sold: false,
          condition: 'new',
        });

      // Add event
      const eventId = await createTestEvent(t, userId);

      await t.withIdentity({ subject: userId }).mutation(api.eventProducts.addProductToEvent, {
        eventId: eventId,
        productId: productId,
      });

      const productEvent = await t.run(async (ctx) => {
        return await ctx.db
          .query('eventProducts')
          .withIndex('by_eventId', (q) => q.eq('eventId', eventId))
          .unique();
      });
      const productEventId = productEvent!._id;

      // 2. Delete
      await t
        .withIdentity({ subject: userId })
        .mutation(api.products.deleteProduct, { id: productId });

      // 3. Verify
      const rel = await t.run(async (ctx) => {
        return await ctx.db.get(productEventId);
      });

      expect(rel).toBeNull();
    });

    test('Unauthenticated user cannot delete a product', async () => {
      const t = convexTest(schema);

      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', {
          name: 'Vendor',
          email: 'vendor@example.com',
          systemRole: 'admin',
        });
      });
      const category = await t
        .withIdentity({ subject: userId })
        .mutation(api.categories.createCategory, {
          label: 'Music',
        });

      const productId = await t
        .withIdentity({ subject: userId })
        .mutation(api.products.addProduct, {
          title: 'Product to Delete',
          description: 'Beschreibung',
          price: 100,
          productCategory: category,
          images: [],
          vendorId: userId,
          readyForSale: true,
          condition: 'new',
          sold: false,
        });

      await expect(t.mutation(api.products.deleteProduct, { id: productId! })).rejects.toThrow(
        'Not authenticated'
      );
    });

    test("User cannot delete multiple products if one doesn't belong to them", async () => {
      const t = convexTest(schema);

      const userAId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', {
          name: 'Vendor A',
          email: 'vendora@example.com',
          systemRole: 'admin',
        });
      });

      const userBId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', {
          name: 'Vendor B',
          email: 'vendorb@example.com',
        });
      });

      const category = await t
        .withIdentity({ subject: userAId })
        .mutation(api.categories.createCategory, {
          label: 'Misc',
        });

      const productAId = await t
        .withIdentity({ subject: userAId })
        .mutation(api.products.addProduct, {
          title: 'User A Product',
          description: 'Beschreibung',
          price: 100,
          productCategory: category,
          images: [],
          vendorId: userAId,
          readyForSale: true,
          condition: 'new',
          sold: false,
        });

      const productBId = await t
        .withIdentity({ subject: userBId })
        .mutation(api.products.addProduct, {
          title: 'User B Product',
          description: 'Beschreibung',
          price: 200,
          productCategory: category,
          images: [],
          vendorId: userBId,
          readyForSale: true,
          condition: 'new',
          sold: false,
        });

      await expect(
        t.withIdentity({ subject: userAId }).mutation(api.products.deleteProducts, {
          ids: [productAId!, productBId!],
        })
      ).rejects.toThrow('Not authorized to delete product');
    });

    test('deleteProduct throws if product not found', async () => {
      const t = convexTest(schema);
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', { name: 'V', email: 'v@e.com', systemRole: 'admin' });
      });
      const category = await t
        .withIdentity({ subject: userId })
        .mutation(api.categories.createCategory, {
          label: 'Misc',
        });

      // Create dummy product to get a valid ID format, then delete it
      const productId = await t.run(async (ctx) => {
        const id = await ctx.db.insert('products', {
          title: 'P1',
          description: '',
          price: 0,
          productCategory: category,
          images: [],
          vendorId: userId,
          sold: false,
          readyForSale: false,
          condition: 'new',
          updatedAt: Date.now(),
        });
        await ctx.db.delete(id);
        return id;
      });

      await expect(
        t.withIdentity({ subject: userId }).mutation(api.products.deleteProduct, {
          id: productId,
        })
      ).rejects.toThrow('Product not found');
    });

    test('deleteProducts throws if unauthenticated', async () => {
      const t = convexTest(schema);
      await expect(t.mutation(api.products.deleteProducts, { ids: [] })).rejects.toThrow(
        'Not authenticated'
      );
    });
  });

  describe('setReadyForSale', () => {
    test('Can toggle readyForSale status', async () => {
      const t = convexTest(schema);
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', {
          name: 'Vendor',
          email: 'v@e.com',
          systemRole: 'admin',
        });
      });

      const category = await t
        .withIdentity({ subject: userId })
        .mutation(api.categories.createCategory, {
          label: 'Misc',
        });

      const productId = await t
        .withIdentity({ subject: userId })
        .mutation(api.products.addProduct, {
          title: 'Draft Product',
          description: '...',
          price: 100,
          productCategory: category,
          images: [],
          vendorId: userId,
          sold: false,
          readyForSale: false,
          condition: 'new',
        });

      // Toggle to true
      await t.withIdentity({ subject: userId }).mutation(api.products.setProductReadyForSale, {
        productId: productId!,
        readyForSale: true,
      });

      const updated = await t.query(api.products.getProduct, { productId: productId! });
      expect(updated?.readyForSale).toBe(true);
    });

    test("User cannot toggle readyForSale on another user's product", async () => {
      const t = convexTest(schema);
      const userAId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', {
          name: 'Vendor A',
          email: 'a@e.com',
          systemRole: 'admin',
        });
      });
      const userBId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', {
          name: 'Vendor B',
          email: 'b@e.com',
        });
      });

      const category = await t
        .withIdentity({ subject: userAId })
        .mutation(api.categories.createCategory, {
          label: 'Misc',
        });

      const productId = await t
        .withIdentity({ subject: userAId })
        .mutation(api.products.addProduct, {
          title: 'User A Product',
          description: '...',
          price: 100,
          productCategory: category,
          images: [],
          vendorId: userAId,
          sold: false,
          readyForSale: false,
          condition: 'new',
        });

      await expect(
        t.withIdentity({ subject: userBId }).mutation(api.products.setProductReadyForSale, {
          productId: productId!,
          readyForSale: true,
        })
      ).rejects.toThrow('Not authorized to update this product');
    });

    test('setProductReadyForSale throws if product not found', async () => {
      const t = convexTest(schema);
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', { name: 'V', email: 'v@e.com', systemRole: 'admin' });
      });

      const category = await t
        .withIdentity({ subject: userId })
        .mutation(api.categories.createCategory, {
          label: 'Misc',
        });

      // Create dummy product to get a valid ID format, then delete it
      const productId = await t.run(async (ctx) => {
        const id = await ctx.db.insert('products', {
          title: 'P1',
          description: '',
          price: 0,
          productCategory: category,
          images: [],
          vendorId: userId,
          sold: false,
          readyForSale: false,
          condition: 'new',
          updatedAt: Date.now(),
        });
        await ctx.db.delete(id);
        return id;
      });

      await expect(
        t.withIdentity({ subject: userId }).mutation(api.products.setProductReadyForSale, {
          productId,
          readyForSale: true,
        })
      ).rejects.toThrow('Product not found');
    });
  });

  test('get returns all products', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'V', email: 'v@e.com', systemRole: 'admin' });
    });

    const category = await t
      .withIdentity({ subject: userId })
      .mutation(api.categories.createCategory, {
        label: 'Misc',
      });

    await t.withIdentity({ subject: userId }).mutation(api.products.addProduct, {
      title: 'P1',
      description: 'D1',
      price: 10,
      productCategory: category, //C
      images: [],
      vendorId: userId,
      sold: false,
      readyForSale: true,
      condition: 'new',
    });

    const products = await t.query(api.products.get);
    expect(products).toHaveLength(1);
    expect(products[0].title).toBe('P1');
  });

  test('getImageUrls returns urls', async () => {
    const t = convexTest(schema);
    const urls = await t.query(api.products.getImageUrls, { storageIds: [] });
    expect(urls).toEqual([]);
  });

  test('getEventIdsForProduct returns event IDs', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'V', email: 'v@e.com', systemRole: 'admin' });
    });
    const category = await t
      .withIdentity({ subject: userId })
      .mutation(api.categories.createCategory, {
        label: 'Misc',
      });
    const productId = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'P1',
        description: '',
        price: 0,
        productCategory: category,
        images: [],
        vendorId: userId,
        sold: false,
        readyForSale: false,
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
        organizerId: userId,
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert('eventProducts', { status: 'announced', eventId, productId });
    });

    const eventIds = await t.query(api.eventProducts.getEventIdsForProduct, { productId });
    expect(eventIds).toContain(eventId);
  });

  test('getProductsWithEvents returns products with event IDs', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'V', email: 'v@e.com', systemRole: 'admin' });
    });
    const category = await t
      .withIdentity({ subject: userId })
      .mutation(api.categories.createCategory, {
        label: 'Misc',
      });
    const productId = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'P1',
        description: '',
        price: 0,
        productCategory: category,
        images: [],
        vendorId: userId,
        sold: false,
        readyForSale: false,
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
        organizerId: userId,
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert('eventProducts', { status: 'announced', eventId, productId });
    });

    const products = await t.query(api.products.getProductsWithEvents);
    expect(products).toHaveLength(1);
    expect(products[0]._id).toBe(productId);
    expect(products[0].eventIds).toContain(eventId);
  });

  test('deleteProducts removes products and their relations', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Vendor',
        email: 'v@e.com',
        systemRole: 'admin',
      });
    });
    const category = await t
      .withIdentity({ subject: userId })
      .mutation(api.categories.createCategory, {
        label: 'Misc',
      });

    // Create 2 products
    const p1 = await t.withIdentity({ subject: userId }).mutation(api.products.addProduct, {
      title: 'P1',
      description: '',
      price: 10,
      productCategory: category,
      images: [],
      vendorId: userId,
      readyForSale: true,
      sold: false,
      condition: 'new',
    });
    const p2 = await t.withIdentity({ subject: userId }).mutation(api.products.addProduct, {
      title: 'P2',
      description: '',
      price: 10,
      productCategory: category,
      images: [],
      vendorId: userId,
      readyForSale: true,
      sold: false,
      condition: 'new',
    });

    // Create event and link p1
    const eventId = await createTestEvent(t, userId);
    await t.withIdentity({ subject: userId }).mutation(api.eventProducts.addProductToEvent, {
      eventId: eventId,
      productId: p1,
    });

    // Bulk delete
    await t
      .withIdentity({ subject: userId })
      .mutation(api.products.deleteProducts, { ids: [p1, p2] });

    // Verify products deleted
    const remaining = await t.withIdentity({ subject: userId }).query(api.products.getMyProducts);
    expect(remaining).toHaveLength(0);

    // Verify relation deleted
    const rel = await t.run(async (ctx) => {
      return await ctx.db
        .query('eventProducts')
        .withIndex('by_productId', (q) => q.eq('productId', p1))
        .first();
    });
    expect(rel).toBeNull();
  });

  test('updateProduct throws if unauthenticated', async () => {
    const t = convexTest(schema);
    const { productId, categoryId } = await t.run(async (ctx) => {
      const cid = await ctx.db.insert('categories', { label: 'C', updatedAt: 0 });
      const pid = await ctx.db.insert('products', {
        title: 'P',
        description: '',
        price: 0,
        productCategory: cid,
        images: [],
        vendorId: await ctx.db.insert('users', { name: 'V' }),
        sold: false,
        readyForSale: false,
        condition: 'new',
        updatedAt: 0,
      });
      return { productId: pid, categoryId: cid };
    });

    await expect(
      t.mutation(api.products.updateProduct, {
        productId,
        title: 'T',
        description: 'D',
        condition: 'new',
        productCategory: categoryId,
        images: [],
        price: 10,
        readyForSale: true,
      })
    ).rejects.toThrow('Not authenticated');
  });

  test('setProductReadyForSale throws if unauthenticated', async () => {
    const t = convexTest(schema);
    const { productId } = await t.run(async (ctx) => {
      const cid = await ctx.db.insert('categories', { label: 'C', updatedAt: 0 });
      const pid = await ctx.db.insert('products', {
        title: 'P',
        description: '',
        price: 0,
        productCategory: cid,
        images: [],
        vendorId: await ctx.db.insert('users', { name: 'V' }),
        sold: false,
        readyForSale: false,
        condition: 'new',
        updatedAt: 0,
      });
      return { productId: pid };
    });

    await expect(
      t.mutation(api.products.setProductReadyForSale, {
        productId,
        readyForSale: true,
      })
    ).rejects.toThrow('Not authenticated');
  });
});
