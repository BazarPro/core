import { ConvexError, v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, type MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { PRODUCT_CONDITIONS } from './constants';
import { hasAnyEventRoleOrAdmin } from './eventRoles';
import { normalizeProductExtras } from './products';
import { EMAIL_PATTERN } from './constants';

/** Same limit as the product form of sellers. */
const MAX_WALK_IN_IMAGES = 3;

/**
 * Walk-in sellers are people who show up at the bazaar without an account. An organizer
 * creates them on site; they cannot log in. Their items are created and answered for by
 * the organizers of that event.
 */

async function requireOpenEventManager(ctx: MutationCtx, eventId: Id<'events'>) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError('Not authenticated');
  if (!(await hasAnyEventRoleOrAdmin(ctx, eventId, userId, ['organizer', 'coorganizer']))) {
    throw new ConvexError('Not authorized');
  }
  const event = await ctx.db.get(eventId);
  if (!event) throw new ConvexError('Event not found');
  if (event.endDate < Date.now()) {
    throw new ConvexError('Die Veranstaltung ist bereits vorbei.');
  }
  return event;
}

export const createWalkInSeller = mutation({
  args: {
    eventId: v.id('events'),
    firstName: v.string(),
    lastName: v.string(),
    contactEmail: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const event = await requireOpenEventManager(ctx, args.eventId);

    const firstName = args.firstName.trim();
    const lastName = args.lastName.trim();
    if (!firstName || !lastName) throw new ConvexError('Bitte Vor- und Nachnamen angeben.');
    const contactEmail = args.contactEmail?.trim() || undefined;
    if (contactEmail && !EMAIL_PATTERN.test(contactEmail)) {
      throw new ConvexError('Bitte gib eine gültige E-Mail-Adresse ein.');
    }

    const userId = await ctx.db.insert('users', {
      name: `${firstName} ${lastName}`,
      firstName,
      lastName,
      phone: args.phone?.trim() || undefined,
      contactEmail,
      status: 'active',
      systemRole: 'user',
      needsOnboarding: false,
      managedByEventId: args.eventId,
    });

    await ctx.db.insert('eventSeller', {
      event: args.eventId,
      user: userId,
      totalFee: 0,
      comissionFee: 0,
      saleFeeFixed: event.saleFeeFixed,
      saleFeePercentage: event.saleFeePercentage,
      numberpayoutAmount: 0,
      payoutReceived: false,
    });
    await ctx.db.insert('eventRole', { event: args.eventId, user: userId, roles: 'seller' });

    return userId;
  },
});

/**
 * Creates (or, with productId, updates) an item of a walk-in seller and lists it in the
 * event. New items start as "announced" and go through the normal acceptance.
 */
export const saveWalkInProduct = mutation({
  args: {
    eventId: v.id('events'),
    sellerId: v.id('users'),
    productId: v.optional(v.id('products')),
    title: v.string(),
    description: v.string(),
    condition: v.union(...PRODUCT_CONDITIONS.map(v.literal)),
    productCategory: v.id('categories'),
    price: v.number(),
    attributes: v.optional(v.record(v.string(), v.string())),
    acceptsOffers: v.optional(v.boolean()),
    minimumPrice: v.optional(v.number()),
    /** Photos taken at the desk; on update they replace the existing ones. */
    images: v.optional(v.array(v.id('_storage'))),
  },
  handler: async (ctx, { eventId, sellerId, productId, images, ...fields }) => {
    await requireOpenEventManager(ctx, eventId);

    const seller = await ctx.db.get(sellerId);
    if (!seller || seller.managedByEventId !== eventId) {
      throw new ConvexError(
        'Nur Artikel von vor Ort angelegten Verkäufern können hier erfasst werden.'
      );
    }
    const registration = await ctx.db
      .query('eventSeller')
      .withIndex('by_event_user', (q) => q.eq('event', eventId).eq('user', sellerId))
      .first();
    if (registration?.payoutReceived) {
      throw new ConvexError('Der Verkäufer ist bereits abgerechnet.');
    }
    if (fields.title.trim().length < 3) {
      throw new ConvexError('Produkttitel muss mindestens 3 Zeichen haben');
    }
    if (!Number.isFinite(fields.price) || fields.price < 0) {
      throw new ConvexError('Preis darf nicht negativ sein');
    }
    if (images && images.length > MAX_WALK_IN_IMAGES) {
      throw new ConvexError(`Höchstens ${MAX_WALK_IN_IMAGES} Bilder pro Artikel.`);
    }

    const extras = await normalizeProductExtras(ctx, fields);
    const data = {
      ...fields,
      title: fields.title.trim(),
      ...extras,
      // Without an account nobody could answer online offers
      acceptsOffers: false,
      updatedAt: Date.now(),
    };

    if (productId) {
      const product = await ctx.db.get(productId);
      if (!product || product.vendorId !== sellerId)
        throw new ConvexError('Artikel nicht gefunden.');
      if (product.sold) throw new ConvexError('Verkaufte Artikel können nicht geändert werden.');
      await ctx.db.patch(productId, images ? { ...data, images } : data);
      return productId;
    }

    const newProductId = await ctx.db.insert('products', {
      ...data,
      vendorId: sellerId,
      images: images ?? [],
      readyForSale: true,
      sold: false,
    });
    await ctx.db.insert('eventProducts', {
      eventId,
      productId: newProductId,
      status: 'announced',
    });
    return newProductId;
  },
});
