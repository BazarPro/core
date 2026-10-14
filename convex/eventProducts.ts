import { query, mutation, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { EVENT_PRODUCT_STATUSES } from './constants';
import { assertVendorNotPaidOut, hasAnyEventRoleOrAdmin } from './eventRoles';
import { getDiscountAvailability, resolveEventFeatures } from './eventFeatures';
import { withoutPrivateProductFields } from './products';
import { closeOffersForEventProduct, reopenClosedOffers } from './offers';
import { assertItemLimit } from './sellerNumbers';
import { toSaleInfo } from './sales';
import { isEventApproved } from './events';

const MAX_INTERNAL_NOTE_LENGTH = 500;

/** Loads events by id, each at most once per query (many relations share one event). */
export type EventLoader = (eventId: Id<'events'>) => Promise<Doc<'events'> | null>;

export function createEventLoader(ctx: QueryCtx | MutationCtx): EventLoader {
  const cache = new Map<Id<'events'>, Promise<Doc<'events'> | null>>();
  return (eventId) => {
    let event = cache.get(eventId);
    if (!event) {
      event = ctx.db.get(eventId);
      cache.set(eventId, event);
    }
    return event;
  };
}

export function getProductRelations(ctx: QueryCtx | MutationCtx, productId: Id<'products'>) {
  return ctx.db
    .query('eventProducts')
    .withIndex('by_productId', (q) => q.eq('productId', productId))
    .collect();
}

/**
 * The listing that matters for buyers right now: the running or next upcoming event
 * in which the product is announced or available. Offers and questions belong to it.
 */
export async function findActiveEventListing(
  ctx: QueryCtx | MutationCtx,
  productId: Id<'products'>,
  now: number
): Promise<{ event: Doc<'events'>; eventProduct: Doc<'eventProducts'> } | null> {
  return pickActiveEventListing(
    await getProductRelations(ctx, productId),
    createEventLoader(ctx),
    now
  );
}

/** findActiveEventListing for relations that are already loaded. */
export async function pickActiveEventListing(
  relations: Doc<'eventProducts'>[],
  loadEvent: EventLoader,
  now: number
): Promise<{ event: Doc<'events'>; eventProduct: Doc<'eventProducts'> } | null> {
  let best: { event: Doc<'events'>; eventProduct: Doc<'eventProducts'> } | null = null;
  for (const relation of relations) {
    if (relation.status !== 'announced' && relation.status !== 'available') continue;
    const event = await loadEvent(relation.eventId);
    if (!event || event.endDate < now || event.moderation) continue;
    if (event.visibility === 'public' && !isEventApproved(event)) continue;
    if (!best || event.startDate < best.event.startDate) {
      best = { event, eventProduct: relation };
    }
  }
  return best;
}

/**
 * Adds a product to an event if the user owns the product.
 * Creates event-product relation with default 'announced' status if not specified.
 * Returns existing relation ID if already exists.
 *
 * @param eventId - ID of the event
 * @param productId - ID of the product to add
 * @param status - Optional initial status for the product in the event
 * @returns ID of the created or existing event-product relation
 */
export const addProductToEvent = mutation({
  args: {
    eventId: v.id('events'),
    productId: v.id('products'),
    status: v.optional(v.union(...EVENT_PRODUCT_STATUSES.map(v.literal))),
  },
  handler: async (ctx, { eventId, productId, status }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    const event = await ctx.db.get(eventId);
    if (!event) throw new Error('Event not found');
    if (event.endDate < Date.now()) {
      throw new Error(
        'Hinzufügen von Produkten nicht möglich: Veranstaltung liegt bereits in der Vergangenheit.'
      );
    }

    const product = await ctx.db.get(productId);
    if (!product) throw new Error('Product not found');
    if (product.vendorId !== userId) {
      throw new Error('Not authorized to add this product to event');
    }
    if (product.sold) {
      throw new Error('Sold products cannot be added to events');
    }

    const existing = await ctx.db
      .query('eventProducts')
      .withIndex('by_eventId_productId', (q) => q.eq('eventId', eventId).eq('productId', productId))
      .first();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert('eventProducts', {
      eventId,
      productId,
      status: status ? status : 'announced',
    });
  },
});

/**
 * Removes a product from an event if the user owns the product.
 *
 * @param eventId - ID of the event
 * @param productId - ID of the product to remove
 */
export const removeProductFromEvent = mutation({
  args: {
    eventId: v.id('events'),
    productId: v.id('products'),
  },
  handler: async (ctx, { eventId, productId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    const event = await ctx.db.get(eventId);
    if (!event) throw new Error('Event not found');
    if (event.endDate < Date.now()) {
      throw new Error(
        'Entfernen von Produkten nicht möglich: Veranstaltung liegt bereits in der Vergangenheit.'
      );
    }

    const product = await ctx.db.get(productId);
    if (!product) throw new Error('Product not found');
    if (product.vendorId !== userId) {
      throw new Error('Not authorized to remove this product from event');
    }
    if (product.sold) {
      throw new Error('Sold products cannot be removed from events');
    }

    const eventProduct = await ctx.db
      .query('eventProducts')
      .withIndex('by_eventId_productId', (q) => q.eq('eventId', eventId).eq('productId', productId))
      .first();

    if (eventProduct) {
      if (eventProduct.status !== 'announced') {
        throw new Error('Product cannot be removed after check-in');
      }
      await ctx.db.delete(eventProduct._id);
    }
  },
});

/**
 * Replaces all event announcements for a product with new ones.
 * New associations always start as 'announced'; only the event team moves them on
 * (check-in, sale, return).
 *
 * @param productId - ID of the product
 * @param eventIds - Array of event IDs to announce the product for
 * @returns Array of relation IDs
 */
export const setProductEvents = mutation({
  args: {
    productId: v.id('products'),
    eventIds: v.array(v.id('events')),
  },
  handler: async (ctx, { productId, eventIds }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    const product = await ctx.db.get(productId);
    if (!product) throw new Error('Product not found');
    if (product.vendorId !== userId) {
      throw new Error('Not authorized to modify this product');
    }
    if (product.sold && eventIds.length > 0) {
      throw new Error('Sold products cannot be assigned to new events');
    }

    const existingRelations = await ctx.db
      .query('eventProducts')
      .withIndex('by_productId', (q) => q.eq('productId', productId))
      .collect();
    const wanted = new Set<string>(eventIds);
    const existingByEvent = new Map(existingRelations.map((r) => [r.eventId as string, r]));

    // Only announcements are replaced. Handed-in, sold and returned entries are the
    // bazaar's history (settlement, returns) and stay as they are.
    for (const relation of existingRelations) {
      if (relation.status === 'announced' && !wanted.has(relation.eventId)) {
        await closeOffersForEventProduct(ctx, relation._id, product.title, 'removed');
        await ctx.db.delete(relation._id);
      }
    }

    const relationIds = [];
    for (const eventId of eventIds) {
      const existing = existingByEvent.get(eventId);
      if (existing) {
        relationIds.push(existing._id);
        continue;
      }
      const event = await ctx.db.get(eventId);
      if (!event) continue;

      if (event.endDate < Date.now()) {
        throw new Error(
          'Verknüpfung nicht möglich: Die Veranstaltung liegt bereits in der Vergangenheit.'
        );
      }
      await assertItemLimit(ctx, event, product.vendorId, 1);

      const relationId = await ctx.db.insert('eventProducts', {
        eventId,
        productId,
        status: 'announced',
      });
      relationIds.push(relationId);
    }

    return relationIds;
  },
});

/**
 * Gets all event IDs that a product is associated with.
 *
 * @param productId - ID of the product
 * @returns Array of event IDs
 */
export const getEventIdsForProduct = query({
  args: {
    productId: v.id('products'),
  },
  handler: async (ctx, { productId }) => {
    const relations = await ctx.db
      .query('eventProducts')
      .withIndex('by_productId', (q) => q.eq('productId', productId))
      .collect();

    return relations.map((r) => r.eventId);
  },
});

/**
 * Public: assigned location label per event for a product (inventory / organizer).
 */
export const getEventLocationsForProduct = query({
  args: {
    productId: v.id('products'),
  },
  handler: async (ctx, { productId }) => {
    const relations = await ctx.db
      .query('eventProducts')
      .withIndex('by_productId', (q) => q.eq('productId', productId))
      .collect();

    const entries = await Promise.all(
      relations.map(async (ep) => {
        const locationCategory = ep.locationCategoryId
          ? await ctx.db.get(ep.locationCategoryId)
          : null;
        return {
          eventId: ep.eventId,
          locationLabel: locationCategory?.label,
        };
      })
    );

    return entries;
  },
});

/**
 * Gets all product IDs associated with an event.
 *
 * @param eventId - ID of the event
 * @returns Array of product IDs
 */
export const getProductIdsForEvent = query({
  args: {
    eventId: v.id('events'),
  },
  handler: async (ctx, { eventId }) => {
    const relations = await ctx.db
      .query('eventProducts')
      .withIndex('by_eventId', (q) => q.eq('eventId', eventId))
      .collect();

    return relations.map((r) => r.productId);
  },
});

/**
 * Gets the status and discount of a product in an event.
 *
 * @param eventId - ID of the event
 * @param productId - ID of the product
 * @returns Status and discount of the product in the event, or null if not associated
 */
export const getMyEventProductStatuses = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, { eventId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    const relations = await ctx.db
      .query('eventProducts')
      .withIndex('by_eventId', (q) => q.eq('eventId', eventId))
      .collect();

    const entries = await Promise.all(
      relations.map(async (relation) => {
        const product = await ctx.db.get(relation.productId);
        if (!product || product.vendorId !== userId) return null;
        return {
          productId: relation.productId,
          status: relation.status,
          discountPercent: relation.discountPercent,
        };
      })
    );

    return entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  },
});

/**
 * Whether a product is locked for seller changes: while it is handed in at a running
 * or upcoming bazaar ('available'), and for good once it is sold. Returned items are
 * back with the seller and editable again; items still 'available' after a bazaar
 * ended (never booked back) do not lock either.
 */
export async function isProductLocked(
  ctx: QueryCtx | MutationCtx,
  productId: Id<'products'>,
  now: number
): Promise<boolean> {
  const product = await ctx.db.get(productId);
  if (product?.sold) return true;
  return areRelationsLocked(await getProductRelations(ctx, productId), createEventLoader(ctx), now);
}

/** isProductLocked for an unsold product whose relations are already loaded. */
export async function areRelationsLocked(
  relations: Doc<'eventProducts'>[],
  loadEvent: EventLoader,
  now: number
): Promise<boolean> {
  for (const relation of relations) {
    if (relation.status === 'sold') return true;
    if (relation.status !== 'available') continue;
    const event = await loadEvent(relation.eventId);
    if (event && event.endDate >= now) return true;
  }
  return false;
}

/**
 * Checks if a product is locked for seller modifications (see isProductLocked).
 *
 * @param productId - ID of the product to check
 * @returns True if product is locked, false otherwise
 */
export const isProductLockedForSeller = query({
  args: { productId: v.id('products') },
  handler: async (ctx, args) => {
    return await isProductLocked(ctx, args.productId, Date.now());
  },
});

/**
 * Gets products for an event, filtered by ownership or public availability.
 * Includes event-specific status information.
 *
 * @param eventId - ID of the event
 * @returns Array of products with event status
 */
export const getProductsForEvent = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) return [];
    // Blocked by moderation: only the event team and admins still see the items
    if (
      event.moderation &&
      !(
        userId &&
        (await hasAnyEventRoleOrAdmin(ctx, args.eventId, userId, ['organizer', 'coorganizer']))
      )
    ) {
      return [];
    }

    const eventProducts = await ctx.db
      .query('eventProducts')
      .withIndex('by_eventId', (q) => q.eq('eventId', args.eventId))
      .collect();

    const productsWithStatus = await Promise.all(
      eventProducts.map(async (ep) => {
        const product = await ctx.db.get(ep.productId);
        if (!product) return null;
        const locationCategory = ep.locationCategoryId
          ? await ctx.db.get(ep.locationCategoryId)
          : null;
        return {
          ...withoutPrivateProductFields(product),
          eventProductId: ep._id,
          status: ep.status,
          discountPercent: ep.discountPercent,
          locationCategoryId: ep.locationCategoryId,
          locationLabel: locationCategory?.label,
        };
      })
    );

    return productsWithStatus.filter(
      (p): p is NonNullable<typeof p> =>
        p !== null && (p.vendorId === userId || (p.readyForSale && !p.moderation))
    );
  },
});

/**
 * Gets all products for event management (organizer/co-organizer only).
 * Includes event-specific status information for all products.
 *
 * @param eventId - ID of the event
 * @returns Array of all products with event status
 */
export const getProductsForEventManagement = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    if (!(await hasAnyEventRoleOrAdmin(ctx, args.eventId, userId, ['organizer', 'coorganizer']))) {
      throw new Error('Not authorized');
    }

    const eventProducts = await ctx.db
      .query('eventProducts')
      .withIndex('by_eventId', (q) => q.eq('eventId', args.eventId))
      .collect();
    // What was actually paid: offers and negotiated prices differ from the label
    const purchases = await ctx.db
      .query('purchase')
      .withIndex('by_event_seller', (q) => q.eq('event', args.eventId))
      .collect();
    const purchaseByProduct = new Map(purchases.map((p) => [p.product as string, p]));

    const productsWithStatus = await Promise.all(
      eventProducts.map(async (ep) => {
        const product = await ctx.db.get(ep.productId);
        if (!product) return null;
        const locationCategory = ep.locationCategoryId
          ? await ctx.db.get(ep.locationCategoryId)
          : null;
        const purchase = ep.status === 'sold' ? purchaseByProduct.get(product._id) : undefined;
        return {
          ...product,
          eventProductId: ep._id,
          status: ep.status,
          discountPercent: ep.discountPercent,
          locationCategoryId: ep.locationCategoryId,
          locationLabel: locationCategory?.label,
          internalNote: ep.internalNote,
          sale: purchase ? toSaleInfo(purchase) : undefined,
        };
      })
    );

    return productsWithStatus.filter((p): p is NonNullable<typeof p> => p !== null);
  },
});

/**
 * Gets detailed event-product relation with product and vendor info.
 * Requires organizer/co-organizer role.
 *
 * @param eventId - ID of the event
 * @param productId - ID of the product
 * @returns Event-product relation with product and vendor details, or null
 */
export const getEventProduct = query({
  args: {
    eventId: v.id('events'),
    productId: v.id('products'),
  },
  handler: async (ctx, { eventId, productId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    if (!(await hasAnyEventRoleOrAdmin(ctx, eventId, userId, ['organizer', 'coorganizer']))) {
      throw new Error('Not authorized');
    }

    const ep = await ctx.db
      .query('eventProducts')
      .withIndex('by_eventId_productId', (q) => q.eq('eventId', eventId).eq('productId', productId))
      .first();

    if (!ep) return null;

    const product = await ctx.db.get(productId);
    if (!product) return null;

    const vendor = await ctx.db.get(product.vendorId);
    const locationCategory = ep.locationCategoryId ? await ctx.db.get(ep.locationCategoryId) : null;

    return {
      ...ep,
      product,
      vendor,
      locationLabel: locationCategory?.label,
    };
  },
});

/**
 * Sets the organizer-only note of a product in an event (e.g. the key board hook number).
 * Requires organizer/co-organizer role. An empty note removes it.
 */
export const setEventProductNote = mutation({
  args: {
    eventProductId: v.id('eventProducts'),
    note: v.string(),
  },
  handler: async (ctx, { eventProductId, note }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    const ep = await ctx.db.get(eventProductId);
    if (!ep) throw new Error('Event-product relation not found');
    if (!(await hasAnyEventRoleOrAdmin(ctx, ep.eventId, userId, ['organizer', 'coorganizer']))) {
      throw new Error('Not authorized');
    }

    const trimmed = note.trim();
    if (trimmed.length > MAX_INTERNAL_NOTE_LENGTH) {
      throw new Error(`Die Notiz darf höchstens ${MAX_INTERNAL_NOTE_LENGTH} Zeichen haben.`);
    }
    await ctx.db.patch(eventProductId, { internalNote: trimmed || undefined });
  },
});

/**
 * Updates the discount percentage of a product in an event.
 * Allowed for the product owner during an ongoing event, for non-sold products.
 *
 * @param eventId - ID of the event
 * @param productId - ID of the product
 * @param discountPercent - New discount percentage (0 up to the event's maximum, at most 50)
 */
export const updateProductDiscount = mutation({
  args: {
    eventId: v.id('events'),
    productId: v.id('products'),
    discountPercent: v.number(),
  },
  handler: async (ctx, { eventId, productId, discountPercent }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    const product = await ctx.db.get(productId);
    if (!product) throw new Error('Product not found');
    if (product.vendorId !== userId) {
      throw new Error('Not authorized to update this product');
    }

    const event = await ctx.db.get(eventId);
    if (!event) throw new Error('Event not found');

    const availability = getDiscountAvailability(event, Date.now());
    if (!availability.allowed) {
      throw new Error(availability.reason);
    }

    const { maxDiscountPercent } = resolveEventFeatures(event);
    if (discountPercent < 0 || discountPercent > maxDiscountPercent) {
      throw new Error(`Maximaler Rabatt ist ${maxDiscountPercent}%`);
    }

    const ep = await ctx.db
      .query('eventProducts')
      .withIndex('by_eventId_productId', (q) => q.eq('eventId', eventId).eq('productId', productId))
      .unique();

    if (!ep) throw new Error('Product not found in event');
    if (ep.status !== 'available') {
      throw new Error('Rabatte können nur für verfügbare Produkte festgelegt werden.');
    }

    if (ep.discountPercent !== undefined && discountPercent < ep.discountPercent) {
      throw new Error('Der Rabatt kann nicht mehr verringert werden');
    }

    await ctx.db.patch(ep._id, { discountPercent });
  },
});

/**
 * Updates the status of a product in an event.
 * Requires organizer/co-organizer role for the event.
 *
 * @param eventProductId - ID of the event-product relation
 * @param status - New status to set
 * @param locationCategoryId - Optional; only allowed when status is `available` (assign booth/location category)
 * @returns ID of the updated relation
 */
export const updateProductStatus = mutation({
  args: {
    eventProductId: v.id('eventProducts'),
    status: v.union(...EVENT_PRODUCT_STATUSES.map(v.literal)),
    locationCategoryId: v.optional(v.id('eventLocationCategories')),
  },
  handler: async (ctx, { eventProductId, status, locationCategoryId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    const ep = await ctx.db.get(eventProductId);
    if (!ep) throw new Error('Event-product relation not found');

    // Verify user is organizer or co-organizer of the event
    if (!(await hasAnyEventRoleOrAdmin(ctx, ep.eventId, userId, ['organizer', 'coorganizer']))) {
      throw new Error('Not authorized to update status for this event');
    }
    const product = await ctx.db.get(ep.productId);
    if (product) await assertVendorNotPaidOut(ctx, ep.eventId, product.vendorId);

    if (locationCategoryId !== undefined) {
      if (status !== 'available') {
        throw new Error(
          'Location category can only be set when accepting the product (status available)'
        );
      }
      const cat = await ctx.db.get(locationCategoryId);
      if (!cat || cat.eventId !== ep.eventId) {
        throw new Error('Invalid location category for this event');
      }
    }

    if (status === 'returned' && ep.status !== 'returned') {
      // The item went back to the seller, open offers for it are void
      await closeOffersForEventProduct(ctx, eventProductId, product?.title ?? 'Artikel', 'return');
    } else if (status === 'available' && ep.status === 'returned') {
      // Taken back in after a return: same as undoing it
      await reopenClosedOffers(ctx, eventProductId, product?.title ?? 'Artikel', 'return');
    }
    await ctx.db.patch(eventProductId, {
      status,
      ...(locationCategoryId !== undefined ? { locationCategoryId } : {}),
    });
    return eventProductId;
  },
});

/**
 * Sets or clears the optional location category for an event-product row.
 */
export const setEventProductLocationCategory = mutation({
  args: {
    eventProductId: v.id('eventProducts'),
    locationCategoryId: v.optional(v.id('eventLocationCategories')),
  },
  handler: async (ctx, { eventProductId, locationCategoryId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    const ep = await ctx.db.get(eventProductId);
    if (!ep) throw new Error('Event-product relation not found');

    if (!(await hasAnyEventRoleOrAdmin(ctx, ep.eventId, userId, ['organizer', 'coorganizer']))) {
      throw new Error('Not authorized to update location for this event');
    }

    if (locationCategoryId) {
      const cat = await ctx.db.get(locationCategoryId);
      if (!cat || cat.eventId !== ep.eventId) {
        throw new Error('Ungültige Standortkategorie für dieses Event');
      }
    }

    await ctx.db.patch(eventProductId, {
      locationCategoryId: locationCategoryId ?? undefined,
    });
    return eventProductId;
  },
});

/**
 * Marks all announced products of a vendor as available for an event.
 * Requires organizer/co-organizer role.
 *
 * @param eventId - ID of the event
 * @param vendorId - ID of the vendor
 * @returns Object with count of updated products
 */
export const markAllVendorProductsAvailable = mutation({
  args: {
    eventId: v.id('events'),
    vendorId: v.id('users'),
  },
  handler: async (ctx, { eventId, vendorId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    if (!(await hasAnyEventRoleOrAdmin(ctx, eventId, userId, ['organizer', 'coorganizer']))) {
      throw new Error('Not authorized');
    }
    await assertVendorNotPaidOut(ctx, eventId, vendorId);

    const eventProducts = await ctx.db
      .query('eventProducts')
      .withIndex('by_eventId', (q) => q.eq('eventId', eventId))
      .collect();

    let count = 0;
    for (const ep of eventProducts) {
      const product = await ctx.db.get(ep.productId);
      if (product && product.vendorId === vendorId && ep.status === 'announced') {
        await ctx.db.patch(ep._id, { status: 'available' });
        count++;
      }
    }

    return { updatedCount: count };
  },
});

/**
 * Marks all available products of a vendor as returned for an event.
 * Requires organizer/co-organizer role.
 *
 * @param eventId - ID of the event
 * @param vendorId - ID of the vendor
 * @returns Object with count of updated products
 */
export const markAllVendorProductsReturned = mutation({
  args: {
    eventId: v.id('events'),
    vendorId: v.id('users'),
  },
  handler: async (ctx, { eventId, vendorId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    if (!(await hasAnyEventRoleOrAdmin(ctx, eventId, userId, ['organizer', 'coorganizer']))) {
      throw new Error('Not authorized');
    }
    await assertVendorNotPaidOut(ctx, eventId, vendorId);

    const eventProducts = await ctx.db
      .query('eventProducts')
      .withIndex('by_eventId', (q) => q.eq('eventId', eventId))
      .collect();

    let count = 0;
    for (const ep of eventProducts) {
      const product = await ctx.db.get(ep.productId);
      if (product && product.vendorId === vendorId && ep.status === 'available') {
        await ctx.db.patch(ep._id, { status: 'returned' });
        await closeOffersForEventProduct(ctx, ep._id, product.title, 'return');
        count++;
      }
    }

    return { updatedCount: count };
  },
});

/**
 * Undoes a return action, changing product status back to available.
 * Requires feature flag 'allow_undo_inventory_actions' and organizer/co-organizer role.
 *
 * @param eventProductId - ID of the event-product relation to undo return for
 * @returns Success confirmation object
 */
export const undoReturn = mutation({
  args: {
    eventProductId: v.id('eventProducts'),
  },
  handler: async (ctx, { eventProductId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    // Check Feature Flag
    const flag = await ctx.db
      .query('featureFlags')
      .withIndex('by_key', (q) => q.eq('key', 'allow_undo_inventory_actions'))
      .unique();
    if (!flag || !flag.value) {
      throw new Error('Diese Aktion ist derzeit deaktiviert (Feature Flag)');
    }

    const ep = await ctx.db.get(eventProductId);
    if (!ep) throw new Error('Event-product relation not found');

    if (!(await hasAnyEventRoleOrAdmin(ctx, ep.eventId, userId, ['organizer', 'coorganizer']))) {
      throw new Error('Not authorized');
    }

    if (ep.status !== 'returned') {
      throw new Error('Produkt ist nicht als zurückgegeben markiert');
    }
    const product = await ctx.db.get(ep.productId);
    if (product) await assertVendorNotPaidOut(ctx, ep.eventId, product.vendorId);

    await ctx.db.patch(eventProductId, { status: 'available' });
    await reopenClosedOffers(ctx, eventProductId, product?.title ?? 'Artikel', 'return');

    return { success: true };
  },
});
