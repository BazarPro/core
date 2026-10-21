import { v } from 'convex/values';
import { internal } from './_generated/api';
import { getAuthUserId } from '@convex-dev/auth/server';
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { createEventLoader, findActiveEventListing, type EventLoader } from './eventProducts';
import { hasAnyEventRoleOrAdmin } from './eventRoles';
import { areOffersOpen, discountedPrice, resolveEventFeatures } from './eventFeatures';
import { displayName, formatEuro, notifyUser } from './notifications';
import type { OfferCloseReason } from './constants';
import { appError } from './errors';

const MAX_MESSAGE_LENGTH = 300;
function offerWindow(listing: { event: Doc<'events'>; eventProduct: Doc<'eventProducts'> }) {
  return {
    status: listing.eventProduct.status,
    startDate: listing.event.startDate,
    endDate: listing.event.endDate,
  };
}

/**
 * Price a buyer would pay at the cash desk without an offer (discount included).
 * A discount, once set, stays even if the organizer later lowers the maximum or turns
 * discounts off: discounts only ever go up, never back down.
 */
export function currentListPrice(product: Doc<'products'>, eventProduct: Doc<'eventProducts'>) {
  return discountedPrice(product.price, eventProduct.discountPercent);
}

/**
 * Who answers for a product: its seller, or, for walk-in sellers without login,
 * the organizers of the event that created them.
 */
export async function canActForSeller(
  ctx: QueryCtx | MutationCtx,
  product: Doc<'products'>,
  userId: Id<'users'>
): Promise<boolean> {
  if (product.vendorId === userId) return true;
  const vendor = await ctx.db.get(product.vendorId);
  if (!vendor?.managedByEventId) return false;
  return await hasAnyEventRoleOrAdmin(ctx, vendor.managedByEventId, userId, [
    'organizer',
    'coorganizer',
  ]);
}

/**
 * Buyer sends (or updates) a price offer for an item in its next event. Requires the
 * event to allow offers and the seller to accept them. One open offer per buyer and item.
 */
export const makeOffer = mutation({
  args: {
    productId: v.id('products'),
    amount: v.number(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, { productId, amount, message }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw appError('auth.loginToOffer');

    const product = await ctx.db.get(productId);
    if (!product || product.moderation) throw appError('notFound.product');
    if (product.vendorId === userId) {
      throw appError('offer.ownItem');
    }
    if (product.sold) throw appError('product.alreadySold');

    const listing = await findActiveEventListing(ctx, productId, Date.now());
    if (!listing || !resolveEventFeatures(listing.event).priceOffers || !product.acceptsOffers) {
      throw appError('offer.notAllowed');
    }
    if (!areOffersOpen(offerWindow(listing), Date.now())) {
      throw appError('offer.notOpenYet');
    }

    const rounded = Math.round(amount * 100) / 100;
    const listPrice = currentListPrice(product, listing.eventProduct);
    if (!Number.isFinite(rounded) || rounded <= 0) {
      throw appError('offer.invalidAmount');
    }
    if (rounded >= listPrice) {
      throw appError('offer.belowPrice');
    }
    const trimmedMessage = message?.trim().slice(0, MAX_MESSAGE_LENGTH) || undefined;

    const allOffers = await ctx.db
      .query('productOffers')
      .withIndex('by_eventProduct', (q) => q.eq('eventProductId', listing.eventProduct._id))
      .collect();
    const existing = allOffers.filter((offer) => offer.buyerId === userId);
    if (existing.some((offer) => offer.status === 'accepted')) {
      throw appError('offer.alreadyAcceptedYours');
    }
    if (allOffers.some((offer) => offer.status === 'accepted')) {
      throw appError('offer.alreadyAcceptedOther');
    }

    const pending = existing.find((offer) => offer.status === 'pending');
    let offerId: Id<'productOffers'>;
    if (pending) {
      await ctx.db.patch(pending._id, {
        amount: rounded,
        message: trimmedMessage,
        createdAt: Date.now(),
      });
      offerId = pending._id;
    } else {
      offerId = await ctx.db.insert('productOffers', {
        eventId: listing.event._id,
        productId,
        eventProductId: listing.eventProduct._id,
        buyerId: userId,
        amount: rounded,
        message: trimmedMessage,
        status: 'pending',
        createdAt: Date.now(),
      });
    }

    const buyer = await ctx.db.get(userId);
    await notifyUser(
      ctx,
      product.vendorId,
      (t) => ({
        category: 'offers',
        subject: t('offer.new.subject', { title: product.title }),
        heading: t('offer.new.heading'),
        paragraphs: [
          t('offer.new.text', {
            name: displayName(buyer, t),
            title: product.title,
            amount: formatEuro(rounded),
            price: formatEuro(listPrice),
          }),
          ...(trimmedMessage ? [t('offer.new.message', { message: trimmedMessage })] : []),
        ],
        link: { label: t('offer.new.link'), path: `/products/view/${productId}` },
        footnote: t('offer.new.footnote', { event: listing.event.title }),
      }),
      'products'
    );

    return offerId;
  },
});

/** Buyer takes back an open or accepted offer. */
export const withdrawOffer = mutation({
  args: { offerId: v.id('productOffers') },
  handler: async (ctx, { offerId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw appError('auth.required');
    const offer = await ctx.db.get(offerId);
    if (!offer || offer.buyerId !== userId) throw appError('notFound.offer');
    if (offer.status !== 'pending' && offer.status !== 'accepted') {
      throw appError('offer.closed');
    }
    await ctx.db.patch(offerId, { status: 'withdrawn', respondedAt: Date.now() });
  },
});

/**
 * Seller accepts or rejects an open offer. Accepting rejects all other open offers
 * for the same item, so only one buyer holds a deal.
 */
export const respondToOffer = mutation({
  args: { offerId: v.id('productOffers'), accept: v.boolean() },
  handler: async (ctx, { offerId, accept }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw appError('auth.required');

    const offer = await ctx.db.get(offerId);
    if (!offer) throw appError('notFound.offer');
    const product = await ctx.db.get(offer.productId);
    if (!product || !(await canActForSeller(ctx, product, userId))) {
      throw appError('auth.forbidden');
    }
    if (offer.status !== 'pending') {
      throw appError('offer.notOpen');
    }
    const eventProduct = await ctx.db.get(offer.eventProductId);
    if (
      !eventProduct ||
      (eventProduct.status !== 'announced' && eventProduct.status !== 'available')
    ) {
      throw appError('product.unavailable');
    }
    const event = await ctx.db.get(offer.eventId);
    const now = Date.now();
    if (accept && (!event || !areOffersOpen(offerWindow({ event, eventProduct }), now))) {
      throw appError('offer.notOpenYet');
    }
    const others = await ctx.db
      .query('productOffers')
      .withIndex('by_eventProduct', (q) => q.eq('eventProductId', offer.eventProductId))
      .collect();
    if (accept && others.some((other) => other.status === 'accepted')) {
      throw appError('offer.youAccepted');
    }

    await ctx.db.patch(offerId, { status: accept ? 'accepted' : 'rejected', respondedAt: now });
    await notifyUser(ctx, offer.buyerId, (t) => ({
      category: 'buyer',
      subject: accept
        ? t('offer.accepted.subject', { title: product.title })
        : t('offer.rejected.subject', { title: product.title }),
      heading: accept ? t('offer.accepted.heading') : t('offer.rejected.heading'),
      paragraphs: accept
        ? [
            t('offer.accepted.text', { amount: formatEuro(offer.amount), title: product.title }),
            event
              ? t('offer.accepted.payAt', { event: event.title })
              : t('offer.accepted.payAtEvent'),
          ]
        : [t('offer.rejected.text', { title: product.title, amount: formatEuro(offer.amount) })],
      link: { label: t('moderation.viewProduct'), path: `/products/view/${product._id}` },
    }));

    if (!accept) return;

    for (const other of others) {
      if (other._id === offerId || other.status !== 'pending') continue;
      await ctx.db.patch(other._id, { status: 'rejected', respondedAt: now });
      await notifyUser(ctx, other.buyerId, (t) => ({
        category: 'buyer',
        subject: t('offer.rejected.subject', { title: product.title }),
        heading: t('offer.rejected.heading'),
        paragraphs: [t('offer.rejected.other', { title: product.title })],
        link: { label: t('moderation.viewProduct'), path: `/products/view/${product._id}` },
      }));
    }
  },
});

function toOfferView(offer: Doc<'productOffers'>, buyer: Doc<'users'> | null) {
  return {
    _id: offer._id,
    amount: offer.amount,
    message: offer.message,
    status: offer.status,
    createdAt: offer.createdAt,
    buyerName: displayName(buyer),
  };
}

/** Offers for the item's current listing, for its seller (or walk-in organizer). */
export const getOffersForProduct = query({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const product = await ctx.db.get(productId);
    if (!product || !(await canActForSeller(ctx, product, userId))) return [];
    const listing = await findActiveEventListing(ctx, productId, Date.now());
    if (!listing) return [];

    const offers = await ctx.db
      .query('productOffers')
      .withIndex('by_eventProduct', (q) => q.eq('eventProductId', listing.eventProduct._id))
      .collect();
    const visible = offers.filter((o) => o.status === 'pending' || o.status === 'accepted');
    const views = await Promise.all(
      visible.map(async (offer) => toOfferView(offer, await ctx.db.get(offer.buyerId)))
    );
    return views.sort((a, b) => b.amount - a.amount);
  },
});

/**
 * Offers for the item's current listing as the event staff sees them: organizers and
 * helpers read along, so they can point visitors to the option. Only the seller (or the
 * organizer of a walk-in seller) may answer, see `canRespond`.
 */
export const getOffersForStaff = query({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const empty = { offers: [], canRespond: false };
    const userId = await getAuthUserId(ctx);
    if (!userId) return empty;
    const product = await ctx.db.get(productId);
    if (!product) return empty;
    const listing = await findActiveEventListing(ctx, productId, Date.now());
    if (!listing) return empty;

    const canRespond = await canActForSeller(ctx, product, userId);
    const isStaff =
      canRespond ||
      (await hasAnyEventRoleOrAdmin(ctx, listing.event._id, userId, ['organizer', 'coorganizer']));
    if (!isStaff) return empty;

    const offers = await ctx.db
      .query('productOffers')
      .withIndex('by_eventProduct', (q) => q.eq('eventProductId', listing.eventProduct._id))
      .collect();
    const visible = offers.filter((o) => o.status === 'pending' || o.status === 'accepted');
    const views = await Promise.all(
      visible.map(async (offer) => toOfferView(offer, await ctx.db.get(offer.buyerId)))
    );
    return { offers: views.sort((a, b) => b.amount - a.amount), canRespond };
  },
});

/** The viewer's latest offer for the item's current listing, if any. */
export const getMyOfferForProduct = query({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const listing = await findActiveEventListing(ctx, productId, Date.now());
    if (!listing) return null;
    const mine = (
      await ctx.db
        .query('productOffers')
        .withIndex('by_eventProduct', (q) => q.eq('eventProductId', listing.eventProduct._id))
        .collect()
    )
      .filter((offer) => offer.buyerId === userId)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    return mine ? toOfferView(mine, null) : null;
  },
});

/** Accepted offers of an event item, for the cash desk. */
export const getAcceptedOffersForEventProduct = query({
  args: { eventProductId: v.id('eventProducts') },
  handler: async (ctx, { eventProductId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const eventProduct = await ctx.db.get(eventProductId);
    if (!eventProduct) return [];
    if (
      !(await hasAnyEventRoleOrAdmin(ctx, eventProduct.eventId, userId, [
        'organizer',
        'coorganizer',
      ]))
    ) {
      return [];
    }
    const offers = await ctx.db
      .query('productOffers')
      .withIndex('by_eventProduct', (q) => q.eq('eventProductId', eventProductId))
      .collect();
    return await Promise.all(
      offers
        .filter((offer) => offer.status === 'accepted')
        .map(async (offer) => {
          const buyer = await ctx.db.get(offer.buyerId);
          const fullName = [buyer?.firstName, buyer?.lastName].filter(Boolean).join(' ');
          return { ...toOfferView(offer, buyer), buyerName: fullName || displayName(buyer) };
        })
    );
  },
});

/**
 * Number of open offers per product of the current user (for the "my products" badges).
 * Offers of ended events no longer count, even before the hourly job has closed them.
 */
export async function countPendingOffers(
  ctx: QueryCtx,
  productId: Id<'products'>,
  loadEvent: EventLoader = createEventLoader(ctx)
) {
  const offers = await ctx.db
    .query('productOffers')
    .withIndex('by_product', (q) => q.eq('productId', productId))
    .collect();
  const now = Date.now();
  let count = 0;
  for (const offer of offers) {
    if (offer.status !== 'pending') continue;
    const event = await loadEvent(offer.eventId);
    if (event && event.endDate >= now) count++;
  }
  return count;
}

/**
 * Closes the open and accepted offers of an event item that can no longer be bought
 * through them (sold, returned or the listing removed), and tells the buyers.
 */
export async function closeOffersForEventProduct(
  ctx: MutationCtx,
  eventProductId: Id<'eventProducts'>,
  productTitle: string,
  reason: OfferCloseReason
) {
  const offers = await ctx.db
    .query('productOffers')
    .withIndex('by_eventProduct', (q) => q.eq('eventProductId', eventProductId))
    .collect();
  const now = Date.now();
  for (const offer of offers) {
    if (offer.status !== 'pending' && offer.status !== 'accepted') continue;
    await ctx.db.patch(offer._id, {
      status: 'rejected',
      respondedAt: now,
      closedBy: reason,
      closedFromStatus: offer.status,
    });
    await notifyUser(ctx, offer.buyerId, (t) => ({
      category: 'buyer',
      subject: t('offer.closed.subject', { title: productTitle }),
      heading: t('offer.closed.heading'),
      paragraphs: [
        t('offer.closed.text', { title: productTitle, amount: formatEuro(offer.amount) }),
      ],
    }));
  }
}

/**
 * Undoing a sale or return: the offers it closed are valid again, as they were before.
 * At most one offer per item can be accepted; should another one be accepted by now,
 * the restored offer comes back as pending.
 */
export async function reopenClosedOffers(
  ctx: MutationCtx,
  eventProductId: Id<'eventProducts'>,
  productTitle: string,
  reason: OfferCloseReason
) {
  const offers = await ctx.db
    .query('productOffers')
    .withIndex('by_eventProduct', (q) => q.eq('eventProductId', eventProductId))
    .collect();
  let hasAccepted = offers.some((offer) => offer.status === 'accepted');
  for (const offer of offers) {
    if (offer.status !== 'rejected' || offer.closedBy !== reason || !offer.closedFromStatus) {
      continue;
    }
    const status = offer.closedFromStatus === 'accepted' && !hasAccepted ? 'accepted' : 'pending';
    if (status === 'accepted') hasAccepted = true;
    await ctx.db.patch(offer._id, {
      status,
      respondedAt: status === 'accepted' ? offer.respondedAt : undefined,
      closedBy: undefined,
      closedFromStatus: undefined,
    });
    await notifyUser(ctx, offer.buyerId, (t) => ({
      category: 'buyer',
      subject: t('offer.reopened.subject', { title: productTitle }),
      heading: t('offer.reopened.heading'),
      paragraphs: [
        t('offer.reopened.text', { title: productTitle }),
        status === 'accepted'
          ? t('offer.reopened.accepted', { amount: formatEuro(offer.amount) })
          : t('offer.reopened.pending', { amount: formatEuro(offer.amount) }),
      ],
      link: { label: t('moderation.viewProduct'), path: `/products/view/${offer.productId}` },
    }));
  }
}

const EXPIRE_BATCH_SIZE = 200;

/**
 * Hourly job: offers that are still open or accepted when their event is over cannot
 * be answered or redeemed any more. They are closed and the buyers are told. Walks
 * the open offers page by page and schedules itself for the next page.
 */
export const expireOffersOfEndedEvents = internalMutation({
  args: {
    status: v.optional(v.union(v.literal('pending'), v.literal('accepted'))),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const status = args.status ?? 'pending';
    const page = await ctx.db
      .query('productOffers')
      .withIndex('by_status', (q) => q.eq('status', status))
      .paginate({ cursor: args.cursor ?? null, numItems: EXPIRE_BATCH_SIZE });

    const now = Date.now();
    const events = new Map<Id<'events'>, Doc<'events'> | null>();
    let expired = 0;
    for (const offer of page.page) {
      if (!events.has(offer.eventId)) events.set(offer.eventId, await ctx.db.get(offer.eventId));
      const event = events.get(offer.eventId);
      if (event && event.endDate >= now) continue;

      await ctx.db.patch(offer._id, {
        status: 'rejected',
        respondedAt: now,
        closedBy: 'expired',
        closedFromStatus: status,
      });
      expired++;
      const product = await ctx.db.get(offer.productId);
      await notifyUser(ctx, offer.buyerId, (t) => {
        const title = product?.title ?? t('offer.expired.item');
        const values = {
          event: event?.title ?? t('offer.expired.bazaar'),
          amount: formatEuro(offer.amount),
          title,
        };
        return {
          category: 'buyer',
          subject: t('offer.expired.subject', { title }),
          heading: t('offer.expired.heading'),
          paragraphs: [
            status === 'accepted'
              ? t('offer.expired.accepted', values)
              : t('offer.expired.pending', values),
          ],
        };
      });
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.offers.expireOffersOfEndedEvents, {
        status,
        cursor: page.continueCursor,
      });
    } else if (status === 'pending') {
      await ctx.scheduler.runAfter(0, internal.offers.expireOffersOfEndedEvents, {
        status: 'accepted',
      });
    }
    return { status, scanned: page.page.length, expired };
  },
});
