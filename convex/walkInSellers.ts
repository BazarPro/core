import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, type MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { PRODUCT_CONDITIONS } from './constants';
import { hasAnyEventRoleOrAdmin } from './eventRoles';
import { normalizeProductExtras } from './products';
import { nextSellerNumber } from './sellerNumbers';
import { EMAIL_PATTERN } from './constants';
import { appError } from './errors';

/** Same limit as the product form of sellers. */
const MAX_WALK_IN_IMAGES = 3;

/**
 * Walk-in sellers are people who show up at the bazaar without an account. An organizer
 * creates them on site; they cannot log in. Their items are created and answered for by
 * the organizers of that event.
 */

async function requireOpenEventManager(ctx: MutationCtx, eventId: Id<'events'>) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw appError('auth.required');
  if (!(await hasAnyEventRoleOrAdmin(ctx, eventId, userId, ['organizer', 'coorganizer']))) {
    throw appError('auth.forbidden');
  }
  const event = await ctx.db.get(eventId);
  if (!event) throw appError('notFound.event');
  if (event.endDate < Date.now()) {
    throw appError('event.over');
  }
  return event;
}

/** The seller was created at this event's desk and is not paid out yet. */
async function requireUnsettledWalkIn(
  ctx: MutationCtx,
  eventId: Id<'events'>,
  sellerId: Id<'users'>
) {
  const seller = await ctx.db.get(sellerId);
  if (!seller || seller.managedByEventId !== eventId) {
    throw appError('product.walkInOnly');
  }
  const registration = await ctx.db
    .query('eventSeller')
    .withIndex('by_event_user', (q) => q.eq('event', eventId).eq('user', sellerId))
    .first();
  if (registration?.payoutReceived) {
    throw appError('seller.paidOut');
  }
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
    await requireOpenEventManager(ctx, args.eventId);

    const firstName = args.firstName.trim();
    const lastName = args.lastName.trim();
    if (!firstName || !lastName) throw appError('profile.nameRequired');
    const contactEmail = args.contactEmail?.trim() || undefined;
    if (contactEmail && !EMAIL_PATTERN.test(contactEmail)) {
      throw appError('common.invalidEmail');
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
      numberpayoutAmount: 0,
      payoutReceived: false,
      number: await nextSellerNumber(ctx, args.eventId),
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
    await requireUnsettledWalkIn(ctx, eventId, sellerId);
    if (fields.title.trim().length < 3) {
      throw appError('product.titleTooShort');
    }
    if (!Number.isFinite(fields.price) || fields.price < 0) {
      throw appError('product.priceNegative');
    }
    if (images && images.length > MAX_WALK_IN_IMAGES) {
      throw appError('product.tooManyImages', { max: MAX_WALK_IN_IMAGES });
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
      if (!product || product.vendorId !== sellerId) throw appError('notFound.product');
      if (product.sold) throw appError('product.soldNoEdit');
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

/**
 * Deletes an item of a walk-in seller, e.g. one recorded by mistake. Only while it is
 * not sold and the seller is not paid out; questions and photos go with it.
 */
export const deleteWalkInProduct = mutation({
  args: { eventId: v.id('events'), productId: v.id('products') },
  handler: async (ctx, { eventId, productId }) => {
    await requireOpenEventManager(ctx, eventId);
    const product = await ctx.db.get(productId);
    if (!product) throw appError('notFound.product');
    await requireUnsettledWalkIn(ctx, eventId, product.vendorId);
    if (product.sold) throw appError('product.soldNoDelete');

    const relations = await ctx.db
      .query('eventProducts')
      .withIndex('by_productId', (q) => q.eq('productId', productId))
      .collect();
    if (relations.some((relation) => relation.status === 'sold')) {
      throw appError('product.soldNoDelete');
    }
    for (const relation of relations) await ctx.db.delete(relation._id);
    const questions = await ctx.db
      .query('productQuestions')
      .withIndex('by_product', (q) => q.eq('productId', productId))
      .collect();
    for (const question of questions) await ctx.db.delete(question._id);
    for (const image of product.images) await ctx.storage.delete(image);
    await ctx.db.delete(productId);
  },
});
