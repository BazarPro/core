import { query, mutation, type MutationCtx, type QueryCtx } from './_generated/server';
import { isPlatformAdmin } from './adminAuth';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { api } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { PRODUCT_CONDITIONS } from './constants';
import { describeAttributes, getCategoryFields, sanitizeAttributes } from './categoryFields';
import {
  areRelationsLocked,
  createEventLoader,
  getProductRelations,
  pickActiveEventListing,
  type EventLoader,
} from './eventProducts';
import { findOrganizerEvent } from './eventRoles';
import {
  getDiscountAvailability,
  missingForEvent,
  resolveEventFeatures,
  type EventFeatures,
} from './eventFeatures';
import { toSaleInfo, type SaleInfo } from './sales';
import { countPendingOffers } from './offers';
import { appError } from './errors';

/** Discount rules of the running event, so the UI can explain why discounts are locked. */
export type DiscountRules = {
  allowed: boolean;
  reason?: string;
  maxDiscountPercent: number;
  discountStartsAt?: number;
};

function discountRulesFor(event: Doc<'events'>, now: number): DiscountRules {
  const availability = getDiscountAvailability(event, now);
  const features = resolveEventFeatures(event);
  return {
    allowed: availability.allowed,
    reason: availability.allowed ? undefined : availability.reason,
    maxDiscountPercent: features.maxDiscountPercent,
    discountStartsAt: features.discountStartsAt,
  };
}

/** Category fields of a product, resolved against the stored category tree. */
export async function getFieldsForCategory(
  ctx: QueryCtx | MutationCtx,
  categoryId: Id<'categories'>
) {
  const categories = await ctx.db.query('categories').collect();
  return getCategoryFields(categoryId, categories);
}

/** Shared validation for the optional price negotiation fields of a product. */
export async function normalizeProductExtras(
  ctx: MutationCtx,
  args: {
    productCategory: Id<'categories'>;
    price: number;
    attributes?: Record<string, string>;
    minimumPrice?: number;
  }
) {
  const fields = await getFieldsForCategory(ctx, args.productCategory);
  const minimumPrice = args.minimumPrice;
  if (minimumPrice !== undefined) {
    if (!Number.isFinite(minimumPrice) || minimumPrice < 0) {
      throw appError('product.minimumNegative');
    }
    if (minimumPrice >= args.price) {
      throw appError('product.minimumAbovePrice');
    }
  }
  return {
    attributes: sanitizeAttributes(fields, args.attributes),
    minimumPrice,
  };
}

/**
 * Removes fields only the seller and the event organizers may see (minimum price).
 */
export function withoutPrivateProductFields<T extends Doc<'products'>>(
  product: T
): Omit<T, 'minimumPrice'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { minimumPrice, ...rest } = product;
  return rest;
}

/**
 * Gets all products
 * @returns Promise<Doc<'products'>[]> - Array of all products (without private fields)
 */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query('products').collect();
    return products.filter((p) => !p.moderation).map(withoutPrivateProductFields);
  },
});

/**
 * Generates an upload URL for product and event images. Logged-in users only, so the
 * storage cannot be filled anonymously.
 * @returns Promise<string> - Upload URL for storage
 */
export const generateUploadUrl = mutation(async (ctx) => {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw appError('auth.loginToUpload');
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
    attributes: v.optional(v.record(v.string(), v.string())),
    acceptsOffers: v.optional(v.boolean()),
    minimumPrice: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw appError('auth.required');

    if (args.vendorId !== userId) throw appError('auth.forbidden');

    const extras = await normalizeProductExtras(ctx, args);
    const productId = await ctx.db.insert('products', {
      ...args,
      ...extras,
      updatedAt: Date.now(),
    });

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
    attributes: v.optional(v.record(v.string(), v.string())),
    acceptsOffers: v.optional(v.boolean()),
    minimumPrice: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw appError('auth.required');

    const { productId, ...rest } = args;
    const product = await ctx.db.get(productId);

    if (!product) throw appError('notFound.product');

    if (product.vendorId !== userId) {
      throw appError('auth.forbidden');
    }

    // Check if locked
    const isLocked = await ctx.runQuery(api.eventProducts.isProductLockedForSeller, { productId });
    if (isLocked) {
      throw appError('product.locked');
    }

    await assertReadyForUpcomingEvents(ctx, { ...product, images: rest.images });

    const extras = await normalizeProductExtras(ctx, rest);
    await ctx.db.patch(productId, { ...rest, ...extras, updatedAt: Date.now() });
  },
});

/** An edit must not remove what an upcoming event of the item requires, e.g. its last photo. */
async function assertReadyForUpcomingEvents(ctx: MutationCtx, product: Doc<'products'>) {
  const now = Date.now();
  for (const relation of await getProductRelations(ctx, product._id)) {
    const event = await ctx.db.get(relation.eventId);
    if (!event || event.endDate < now) continue;
    if (missingForEvent(product, event).includes('photo')) {
      throw appError('product.photoRequired', { event: event.title });
    }
  }
}

/**
 * Adds photos to an item, e.g. when an event requires one before it can be announced.
 * Keeps the existing photos.
 */
export const addProductImages = mutation({
  args: {
    productId: v.id('products'),
    images: v.array(v.id('_storage')),
  },
  handler: async (ctx, { productId, images }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw appError('auth.required');

    const product = await ctx.db.get(productId);
    if (!product) throw appError('notFound.product');
    if (product.vendorId !== userId) {
      throw appError('auth.forbidden');
    }
    if (await ctx.runQuery(api.eventProducts.isProductLockedForSeller, { productId })) {
      throw appError('product.locked');
    }

    await ctx.db.patch(productId, {
      images: [...product.images, ...images],
      updatedAt: Date.now(),
    });
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
    if (!userId) throw appError('auth.required');

    const product = await ctx.db.get(productId);

    if (!product) throw appError('notFound.product');
    if (product.vendorId !== userId) {
      throw appError('auth.forbidden');
    }

    await ctx.db.patch(productId, { readyForSale: readyForSale });
  },
});

/**
 * Whether the seller may delete a product. Products that are handed in or sold at a
 * bazaar stay locked until the bazaar has ended; returned products are back with
 * the seller and may be deleted (archived) right away.
 */
async function getDeletionInfo(ctx: QueryCtx, productId: Id<'products'>) {
  const relations = await getProductRelations(ctx, productId);
  return { ...(await deletionInfoFor(relations, createEventLoader(ctx))), relations };
}

async function deletionInfoFor(relations: Doc<'eventProducts'>[], loadEvent: EventLoader) {
  const now = Date.now();
  let canDelete = true;
  let hasHistory = false;
  for (const relation of relations) {
    if (relation.status === 'announced') continue;
    hasHistory = true;
    if (relation.status === 'returned') continue;
    const event = await loadEvent(relation.eventId);
    if (event && event.endDate > now) canDelete = false;
  }
  return { canDelete, hasHistory };
}

/** Discount and status of the product in the event that is running right now, if any. */
async function runningEventInfo(
  relations: Doc<'eventProducts'>[],
  loadEvent: EventLoader,
  now: number
) {
  for (const relation of relations) {
    const event = await loadEvent(relation.eventId);
    if (event && now >= event.startDate && now <= event.endDate) {
      return {
        discountPercent: relation.discountPercent,
        discountRules: discountRulesFor(event, now),
        eventStatus: relation.status,
        isAvailable: relation.status === 'available',
      };
    }
  }
  return {};
}

/**
 * Deletes a product of the current seller. Products with bazaar history
 * (handed in, sold, returned) are archived instead, so the organizer's
 * settlement keeps its data; they disappear from the seller's list.
 */
async function deleteOwnProduct(ctx: MutationCtx, userId: Id<'users'>, id: Id<'products'>) {
  const product = await ctx.db.get(id);
  if (!product) return;
  if (product.vendorId !== userId) {
    throw appError('auth.forbidden');
  }

  const { canDelete, hasHistory, relations } = await getDeletionInfo(ctx, id);
  if (!canDelete) {
    throw appError('product.acceptedNoDelete', { title: product.title });
  }

  for (const relation of relations) {
    if (relation.status === 'announced') await ctx.db.delete(relation._id);
  }

  if (hasHistory) {
    await ctx.db.patch(id, { archivedAt: Date.now(), readyForSale: false });
  } else {
    await ctx.db.delete(id);
  }
}

/**
 * Deletes a single product
 * @param args.id - ID of the product to delete
 */
export const deleteProduct = mutation({
  args: { id: v.id('products') },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw appError('auth.required');
    const product = await ctx.db.get(id);
    if (!product) throw appError('notFound.product');
    if (product.vendorId !== userId) {
      throw appError('auth.forbidden');
    }
    await deleteOwnProduct(ctx, userId, id);
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
    if (!userId) throw appError('auth.required');
    for (const id of ids) {
      await deleteOwnProduct(ctx, userId, id);
    }
  },
});

/** Whether the current seller may delete the product (see getDeletionInfo) */
export const canDeleteProduct = query({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    const product = await ctx.db.get(productId);
    if (!product || product.vendorId !== userId) return false;
    return (await getDeletionInfo(ctx, productId)).canDelete;
  },
});

export const getProduct = query({
  args: { productId: v.id('products') },
  handler: async (
    ctx,
    { productId }
  ): Promise<
    | (Omit<Doc<'products'>, 'minimumPrice'> & {
        minimumPrice?: number;
        attributeList: { label: string; value: string }[];
        activeListing: {
          eventId: Id<'events'>;
          eventProductId: Id<'eventProducts'>;
          eventTitle: string;
          features: EventFeatures;
          /** Status in that event and its dates, e.g. for when offers open. */
          status: string;
          startDate: number;
          endDate: number;
        } | null;
        /** Price can be negotiated at the cash desk (VB); the minimum itself stays private. */
        isNegotiable: boolean;
        vendorPhone?: string;
        vendorFirstName?: string;
        vendorLastName?: string;
        categoryName: string;
        isOrganizer: boolean;
        organizerEventId: Id<'events'> | null;
        discountPercent?: number;
        discountRules?: DiscountRules;
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

    // Each relation and event is read once and shared by the checks below
    const now = Date.now();
    const relations = await getProductRelations(ctx, productId);
    const loadEvent = createEventLoader(ctx);

    const organizerEventId: Id<'events'> | null = userId
      ? await findOrganizerEvent(
          ctx,
          relations.map((relation) => relation.eventId),
          userId,
          loadEvent
        )
      : null;

    const isOrganizer = !!organizerEventId;

    const isLocked = product.sold || (await areRelationsLocked(relations, loadEvent, now));

    const { discountPercent, discountRules, eventStatus, isAvailable } = await runningEventInfo(
      relations,
      loadEvent,
      now
    );

    const isOwner = userId === product.vendorId;
    const isAdmin = await isPlatformAdmin(ctx, userId);
    // Hidden by moderation: only the seller, the event team and admins still see it
    if (product.moderation && !isOwner && !isOrganizer && !isAdmin) return null;
    const fields = await getFieldsForCategory(ctx, product.productCategory);
    const listing = await pickActiveEventListing(relations, loadEvent, now);

    return {
      ...(isOwner || isOrganizer ? product : withoutPrivateProductFields(product)),
      attributeList: describeAttributes(fields, product.attributes),
      activeListing: listing
        ? {
            eventId: listing.event._id,
            eventProductId: listing.eventProduct._id,
            eventTitle: listing.event.title,
            features: resolveEventFeatures(listing.event),
            status: listing.eventProduct.status,
            startDate: listing.event.startDate,
            endDate: listing.event.endDate,
          }
        : null,
      isNegotiable:
        !!listing &&
        resolveEventFeatures(listing.event).minimumPrice &&
        product.minimumPrice !== undefined,
      vendorPhone: isOrganizer ? (vendor?.phone ?? undefined) : undefined,
      vendorFirstName: isOrganizer ? (vendor?.firstName ?? vendor?.name ?? 'Anonym') : undefined,
      vendorLastName: isOrganizer ? (vendor?.lastName ?? '') : undefined,
      categoryName: category?.label ?? '–',
      isOrganizer: isOrganizer,
      organizerEventId: organizerEventId,
      discountPercent,
      discountRules,
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
  discountRules?: DiscountRules;
  pendingOfferCount?: number;
  unansweredQuestionCount?: number;
  isLocked: boolean;
  canDelete?: boolean;
  eventStatus?: string;
  isAvailable?: boolean;
  /** Sold items: price, fee and payout of the sale. */
  sale?: SaleInfo;
};

export const getMyProducts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw appError('auth.required');

    const products = (
      await ctx.db
        .query('products')
        .withIndex('by_vendorId', (q) => q.eq('vendorId', userId))
        .collect()
    ).filter((product) => !product.archivedAt);

    // Many products share the same events: read each event only once
    const loadEvent = createEventLoader(ctx);
    const now = Date.now();

    const productsWithEvents: ProductWithEvents[] = await Promise.all(
      products.map(async (product): Promise<ProductWithEvents> => {
        const relations = await getProductRelations(ctx, product._id);
        const { canDelete } = await deletionInfoFor(relations, loadEvent);

        if (product.sold) {
          const purchase = await ctx.db
            .query('purchase')
            .withIndex('by_product', (q) => q.eq('product', product._id))
            .first();
          return {
            ...product,
            eventIds: relations.map((relation) => relation.eventId as string),
            discountPercent: purchase?.discountPercent,
            pendingOfferCount: 0,
            unansweredQuestionCount: 0,
            isLocked: true,
            canDelete,
            sale: purchase ? toSaleInfo(purchase) : undefined,
          };
        }

        const isLocked = await areRelationsLocked(relations, loadEvent, now);
        const { discountPercent, discountRules, eventStatus, isAvailable } = await runningEventInfo(
          relations,
          loadEvent,
          now
        );

        // Offers belong to an event of the product; without a running or upcoming one
        // there can be no open offer, so the lookup is skipped
        const hasOpenEvent = (
          await Promise.all(relations.map((relation) => loadEvent(relation.eventId)))
        ).some((event) => event && event.endDate >= now);

        const questions = await ctx.db
          .query('productQuestions')
          .withIndex('by_product', (q) => q.eq('productId', product._id))
          .collect();

        return {
          ...product,
          eventIds: relations.map((relation) => relation.eventId as string),
          discountPercent,
          discountRules,
          pendingOfferCount: hasOpenEvent
            ? await countPendingOffers(ctx, product._id, loadEvent)
            : 0,
          unansweredQuestionCount: questions.filter((q) => !q.answer).length,
          isLocked,
          canDelete,
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
    const products = (await ctx.db.query('products').collect()).filter((p) => !p.moderation);

    const productsWithEvents: ProductWithEvents[] = await Promise.all(
      products.map(async (product): Promise<ProductWithEvents> => {
        const eventIds: Id<'events'>[] = await ctx.runQuery(
          api.eventProducts.getEventIdsForProduct,
          {
            productId: product._id,
          }
        );
        return {
          ...withoutPrivateProductFields(product),
          eventIds: eventIds.map((id: Id<'events'>) => id as string),
          isLocked: false,
        };
      })
    );

    return productsWithEvents;
  },
});
