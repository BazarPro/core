import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { api } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { PRODUCT_CONDITIONS } from './constants';

/**
 * Gets all products
 * @returns Promise<Doc<'products'>[]> - Array of all products
 */
export const get = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('products').collect();
  },
});

/**
 * Generates an upload URL for product images
 * @returns Promise<string> - Upload URL for storage
 */
export const generateUploadUrl = mutation(async (ctx) => {
  return await ctx.storage.generateUploadUrl();
});

/**
 * Adds a new product
 * @param args.title - Product title
 * @param args.vendorId - ID of the vendor (must be current user)
 * @param args.description - Product description
 * @param args.condition - Product condition
 * @param args.images - Array of storage IDs for images
 * @param args.productCategory - ID of the product category
 * @param args.price - Product price
 * @param args.readyForSale - Whether product is ready for sale
 * @param args.sold - Whether product is sold
 * @returns Promise<Id<'products'>> - ID of the created product
 */
export const addProduct = mutation({
  args: {
    title: v.string(),
    vendorId: v.id('users'),
    description: v.string(),
    condition: v.union(...PRODUCT_CONDITIONS.map(v.literal)),
    images: v.array(v.id('_storage')),
    productCategory: v.id('categories'),
    price: v.number(),
    readyForSale: v.boolean(),
    sold: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    if (args.vendorId !== userId) throw new Error('Cannot create product for another user');

    const productId = await ctx.db.insert('products', { ...args, updatedAt: Date.now() });

    return productId;
  },
});

export const updateProduct = mutation({
  args: {
    productId: v.id('products'),
    title: v.string(),
    description: v.string(),
    condition: v.union(...PRODUCT_CONDITIONS.map(v.literal)),
    productCategory: v.id('categories'),
    images: v.array(v.id('_storage')),
    price: v.number(),
    readyForSale: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    const { productId, ...rest } = args;
    const product = await ctx.db.get(productId);

    if (!product) throw new Error('Product not found');

    if (product.vendorId !== userId) {
      throw new Error('Not authorized to update this product');
    }

    // Check if locked
    const isLocked = await ctx.runQuery(api.eventProducts.isProductLockedForSeller, { productId });
    if (isLocked) {
      throw new Error('Product is locked and cannot be edited by seller');
    }

    await ctx.db.patch(productId, { ...rest, updatedAt: Date.now() });
  },
});

/**
 * Sets the ready for sale status of a product
 * @param args.productId - ID of the product
 * @param args.readyForSale - New ready for sale status
 */
export const setProductReadyForSale = mutation({
  args: {
    productId: v.id('products'),
    readyForSale: v.boolean(),
  },
  handler: async (ctx, { productId, readyForSale }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    const product = await ctx.db.get(productId);

    if (!product) throw new Error('Product not found');
    if (product.vendorId !== userId) {
      throw new Error('Not authorized to update this product');
    }

    await ctx.db.patch(productId, { readyForSale: readyForSale });
  },
});

/**
 * Deletes a single product
 * @param args.id - ID of the product to delete
 */
export const deleteProduct = mutation({
  args: { id: v.id('products') },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    const product = await ctx.db.get(id);
    if (!product) throw new Error('Product not found');

    if (product.vendorId !== userId) {
      throw new Error('Not authorized to delete this product');
    }

    const isLocked = await ctx.runQuery(api.eventProducts.isProductLockedForSeller, {
      productId: id,
    });
    if (isLocked) {
      throw new Error('Product is locked and cannot be deleted by seller');
    }

    const relations = await ctx.db
      .query('eventProducts')
      .withIndex('by_productId', (q) => q.eq('productId', id))
      .collect();

    for (const relation of relations) {
      await ctx.db.delete(relation._id);
    }

    await ctx.db.delete(id);
  },
});

/**
 * Deletes multiple products
 * @param args.ids - Array of product IDs to delete
 */
export const deleteProducts = mutation({
  args: { ids: v.array(v.id('products')) },
  handler: async (ctx, { ids }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    for (const id of ids) {
      const product = await ctx.db.get(id);
      if (!product) continue;

      const isLocked = await ctx.runQuery(api.eventProducts.isProductLockedForSeller, {
        productId: id,
      });

      if (product.vendorId !== userId) {
        throw new Error(`Not authorized to delete product ${id}`);
      } else if (isLocked) {
        throw new Error(`Product ${id} is locked and cannot be deleted`);
      }

      const relations = await ctx.db
        .query('eventProducts')
        .withIndex('by_productId', (q) => q.eq('productId', id))
        .collect();

      for (const relation of relations) {
        await ctx.db.delete(relation._id);
      }

      await ctx.db.delete(id);
    }
  },
});

export const getProduct = query({
  args: { productId: v.id('products') },
  handler: async (
    ctx,
    { productId }
  ): Promise<
    | (Doc<'products'> & {
        vendorFirstName?: string;
        vendorLastName?: string;
        categoryName: string;
        isOrganizer: boolean;
        organizerEventId: Id<'events'> | null;
        discountPercent?: number;
        isLocked: boolean;
        eventStatus?: string;
        isAvailable?: boolean;
      })
    | null
  > => {
    const product = await ctx.db.get(productId);
    if (!product) return null;
    const userId = await getAuthUserId(ctx);
    const vendor = await ctx.db.get(product.vendorId);
    const category = await ctx.db.get(product.productCategory);

    const organizerEventId: Id<'events'> | null = userId
      ? await ctx.runQuery(api.eventRoles.isOrganizerOfAnyProductEvent, {
          productId,
          userId,
        })
      : null;

    const isOrganizer = !!organizerEventId;

    const isLocked = await ctx.runQuery(api.eventProducts.isProductLockedForSeller, {
      productId,
    });

    // Find discount if there is an ongoing event
    const now = Date.now();
    const eventRelations = await ctx.db
      .query('eventProducts')
      .withIndex('by_productId', (q) => q.eq('productId', productId))
      .collect();

    let discountPercent: number | undefined = undefined;
    let eventStatus: string | undefined = undefined;
    let isAvailable: boolean | undefined = undefined;

    for (const relation of eventRelations) {
      const event = await ctx.db.get(relation.eventId);
      if (event && now >= event.startDate && now <= event.endDate) {
        if (relation.discountPercent !== undefined) {
          discountPercent = relation.discountPercent;
        }
        eventStatus = relation.status;
        isAvailable = relation.status === 'available';
        break;
      }
    }

    return {
      ...product,
      vendorFirstName: isOrganizer ? (vendor?.firstName ?? vendor?.name ?? 'Anonym') : undefined,
      vendorLastName: isOrganizer ? (vendor?.lastName ?? '') : undefined,
      categoryName: category?.label ?? '–',
      isOrganizer: isOrganizer,
      organizerEventId: organizerEventId,
      discountPercent,
      isLocked,
      eventStatus,
      isAvailable,
    };
  },
});

export const getImageUrls = query({
  args: { storageIds: v.array(v.id('_storage')) },
  handler: async (ctx, { storageIds }) => {
    const urls = await Promise.all(storageIds.map((id) => ctx.storage.getUrl(id)));
    return urls.filter((url): url is string => url !== null);
  },
});
type ProductWithEvents = Doc<'products'> & {
  eventIds: string[];
  discountPercent?: number;
  isLocked: boolean;
  eventStatus?: string;
  isAvailable?: boolean;
};

export const getMyProducts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    const products = await ctx.db
      .query('products')
      .withIndex('by_vendorId', (q) => q.eq('vendorId', userId))
      .collect();

    const productsWithEvents: ProductWithEvents[] = await Promise.all(
      products.map(async (product): Promise<ProductWithEvents> => {
        const eventIds: Id<'events'>[] = await ctx.runQuery(
          api.eventProducts.getEventIdsForProduct,
          {
            productId: product._id,
          }
        );

        const isLocked = await ctx.runQuery(api.eventProducts.isProductLockedForSeller, {
          productId: product._id,
        });

        let discountPercent: number | undefined = undefined;
        let eventStatus: string | undefined = undefined;
        let isAvailable: boolean | undefined = undefined;

        if (product.sold) {
          const purchase = await ctx.db
            .query('purchase')
            .filter((q) => q.eq(q.field('product'), product._id))
            .first();
          if (purchase) {
            discountPercent = purchase.discountPercent;
          }
        } else {
          // Check for ongoing event discount
          const now = Date.now();
          const relations = await ctx.db
            .query('eventProducts')
            .withIndex('by_productId', (q) => q.eq('productId', product._id))
            .collect();

          for (const rel of relations) {
            const event = await ctx.db.get(rel.eventId);
            if (event && now >= event.startDate && now <= event.endDate) {
              if (rel.discountPercent !== undefined) {
                discountPercent = rel.discountPercent;
              }
              eventStatus = rel.status;
              isAvailable = rel.status === 'available';
              break;
            }
          }
        }

        return {
          ...product,
          eventIds: eventIds.map((id: Id<'events'>) => id as string),
          discountPercent,
          isLocked,
          eventStatus,
          isAvailable,
        };
      })
    );

    return productsWithEvents;
  },
});

export const getProductsWithEvents = query({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query('products').collect();

    const productsWithEvents: ProductWithEvents[] = await Promise.all(
      products.map(async (product): Promise<ProductWithEvents> => {
        const eventIds: Id<'events'>[] = await ctx.runQuery(
          api.eventProducts.getEventIdsForProduct,
          {
            productId: product._id,
          }
        );
        return {
          ...product,
          eventIds: eventIds.map((id: Id<'events'>) => id as string),
          isLocked: false,
        };
      })
    );

    return productsWithEvents;
  },
});
