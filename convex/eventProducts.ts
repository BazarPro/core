import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { EVENT_PRODUCT_STATUSES } from './constants';
import { hasAnyEventRoleOrAdmin } from './eventRoles';

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
 * Replaces all event associations for a product with new ones.
 * Deletes existing relations and creates new ones with specified status.
 *
 * @param productId - ID of the product
 * @param eventIds - Array of event IDs to associate the product with
 * @param status - Status to set for all new associations
 * @returns Array of created relation IDs
 */
export const setProductEvents = mutation({
  args: {
    productId: v.id('products'),
    eventIds: v.array(v.id('events')),
    status: v.union(...EVENT_PRODUCT_STATUSES.map(v.literal)),
  },
  handler: async (ctx, { productId, eventIds, status }) => {
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

    for (const relation of existingRelations) {
      const event = await ctx.db.get(relation.eventId);
      if (event && event.endDate < Date.now()) {
        throw new Error(
          'Änderungen nicht möglich: Das Produkt ist bereits mit einer vergangenen Veranstaltung verknüpft.'
        );
      }
      await ctx.db.delete(relation._id);
    }

    const relationIds = [];
    for (const eventId of eventIds) {
      const event = await ctx.db.get(eventId);
      if (!event) continue;

      if (event.endDate < Date.now()) {
        throw new Error(
          'Verknüpfung nicht möglich: Die Veranstaltung liegt bereits in der Vergangenheit.'
        );
      }

      const relationId = await ctx.db.insert('eventProducts', {
        eventId,
        productId,
        status,
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
 * Checks if a product is locked for seller modifications.
 * Product is locked if any event association has status other than 'announced'.
 *
 * @param productId - ID of the product to check
 * @returns True if product is locked, false otherwise
 */
export const isProductLockedForSeller = query({
  args: { productId: v.id('products') },
  handler: async (ctx, args) => {
    const relations = await ctx.db
      .query('eventProducts')
      .withIndex('by_productId', (q) => q.eq('productId', args.productId))
      .collect();

    // Lock if any relation has status other than 'announced'
    return relations.some((r) => r.status !== 'announced');
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
          ...product,
          eventProductId: ep._id,
          status: ep.status,
          discountPercent: ep.discountPercent,
          locationCategoryId: ep.locationCategoryId,
          locationLabel: locationCategory?.label,
        };
      })
    );

    const userId = await getAuthUserId(ctx);
    return productsWithStatus.filter(
      (p): p is NonNullable<typeof p> => p !== null && (p.vendorId === userId || p.readyForSale)
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

    const productsWithStatus = await Promise.all(
      eventProducts.map(async (ep) => {
        const product = await ctx.db.get(ep.productId);
        if (!product) return null;
        const locationCategory = ep.locationCategoryId
          ? await ctx.db.get(ep.locationCategoryId)
          : null;
        return {
          ...product,
          eventProductId: ep._id,
          status: ep.status,
          discountPercent: ep.discountPercent,
          locationCategoryId: ep.locationCategoryId,
          locationLabel: locationCategory?.label,
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
 * Updates the discount percentage of a product in an event.
 * Allowed for the product owner during an ongoing event, for non-sold products.
 *
 * @param eventId - ID of the event
 * @param productId - ID of the product
 * @param discountPercent - New discount percentage (0-50)
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

    const now = Date.now();
    if (now < event.startDate || now > event.endDate) {
      throw new Error('Rabatte können nur während einer laufenden Veranstaltung angepasst werden');
    }

    if (discountPercent < 0 || discountPercent > 50) {
      throw new Error('Maximaler Rabatt ist 50%');
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

    if (locationCategoryId !== undefined) {
      if (status !== 'available') {
        throw new Error('Location category can only be set when accepting the product (status available)');
      }
      const cat = await ctx.db.get(locationCategoryId);
      if (!cat || cat.eventId !== ep.eventId) {
        throw new Error('Invalid location category for this event');
      }
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
        throw new Error('Ungueltige Standortkategorie fuer dieses Event');
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

    const eventProducts = await ctx.db
      .query('eventProducts')
      .withIndex('by_eventId', (q) => q.eq('eventId', eventId))
      .collect();

    let count = 0;
    for (const ep of eventProducts) {
      const product = await ctx.db.get(ep.productId);
      if (product && product.vendorId === vendorId && ep.status === 'available') {
        await ctx.db.patch(ep._id, { status: 'returned' });
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

    await ctx.db.patch(eventProductId, { status: 'available' });

    return { success: true };
  },
});
