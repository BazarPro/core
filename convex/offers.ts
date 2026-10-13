import { ConvexError, v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { findActiveEventListing } from './eventProducts';
import { hasAnyEventRoleOrAdmin } from './eventRoles';
import { areOffersOpen, discountedPrice, resolveEventFeatures } from './eventFeatures';
import { displayName, formatEuro, notifyUser } from './notifications';

const MAX_MESSAGE_LENGTH = 300;
const OFFERS_NOT_OPEN =
  'Preisvorschläge sind erst möglich, wenn der Artikel angenommen wurde und die Veranstaltung läuft.';

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
    if (!userId) throw new ConvexError('Bitte melde dich an, um einen Preis vorzuschlagen.');

    const product = await ctx.db.get(productId);
    if (!product || product.moderation) throw new ConvexError('Artikel nicht gefunden.');
    if (product.vendorId === userId) {
      throw new ConvexError('Für eigene Artikel kannst du keinen Preis vorschlagen.');
    }
    if (product.sold) throw new ConvexError('Dieser Artikel ist bereits verkauft.');

    const listing = await findActiveEventListing(ctx, productId, Date.now());
    if (!listing || !resolveEventFeatures(listing.event).priceOffers || !product.acceptsOffers) {
      throw new ConvexError('Für diesen Artikel sind keine Preisvorschläge möglich.');
    }
    if (!areOffersOpen(offerWindow(listing), Date.now())) {
      throw new ConvexError(OFFERS_NOT_OPEN);
    }

    const rounded = Math.round(amount * 100) / 100;
    const listPrice = currentListPrice(product, listing.eventProduct);
    if (!Number.isFinite(rounded) || rounded <= 0) {
      throw new ConvexError('Bitte gib einen gültigen Betrag ein.');
    }
    if (rounded >= listPrice) {
      throw new ConvexError('Dein Vorschlag muss unter dem aktuellen Preis liegen.');
    }
    const trimmedMessage = message?.trim().slice(0, MAX_MESSAGE_LENGTH) || undefined;

    const allOffers = await ctx.db
      .query('productOffers')
      .withIndex('by_eventProduct', (q) => q.eq('eventProductId', listing.eventProduct._id))
      .collect();
    const existing = allOffers.filter((offer) => offer.buyerId === userId);
    if (existing.some((offer) => offer.status === 'accepted')) {
      throw new ConvexError('Der Verkäufer hat bereits einen Vorschlag von dir angenommen.');
    }
    if (allOffers.some((offer) => offer.status === 'accepted')) {
      throw new ConvexError('Der Verkäufer hat bereits einen anderen Vorschlag angenommen.');
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
    await notifyUser(ctx, product.vendorId, {
      subject: `Neuer Preisvorschlag für „${product.title}“`,
      heading: 'Neuer Preisvorschlag',
      paragraphs: [
        `${displayName(buyer)} schlägt für deinen Artikel „${product.title}“ ${formatEuro(rounded)} vor (aktueller Preis ${formatEuro(listPrice)}).`,
        ...(trimmedMessage ? [`Nachricht: „${trimmedMessage}“`] : []),
      ],
      link: { label: 'Vorschlag ansehen', path: `/products/view/${productId}` },
      footnote: `Gilt für „${listing.event.title}“. Nimmst du an, kann der Käufer den Artikel dort zu diesem Preis kaufen.`,
    });

    return offerId;
  },
});

/** Buyer takes back an open or accepted offer. */
export const withdrawOffer = mutation({
  args: { offerId: v.id('productOffers') },
  handler: async (ctx, { offerId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('Not authenticated');
    const offer = await ctx.db.get(offerId);
    if (!offer || offer.buyerId !== userId) throw new ConvexError('Vorschlag nicht gefunden.');
    if (offer.status !== 'pending' && offer.status !== 'accepted') {
      throw new ConvexError('Dieser Vorschlag ist bereits abgeschlossen.');
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
    if (!userId) throw new ConvexError('Not authenticated');

    const offer = await ctx.db.get(offerId);
    if (!offer) throw new ConvexError('Vorschlag nicht gefunden.');
    const product = await ctx.db.get(offer.productId);
    if (!product || !(await canActForSeller(ctx, product, userId))) {
      throw new ConvexError('Not authorized');
    }
    if (offer.status !== 'pending') {
      throw new ConvexError('Dieser Vorschlag ist nicht mehr offen.');
    }
    const eventProduct = await ctx.db.get(offer.eventProductId);
    if (
      !eventProduct ||
      (eventProduct.status !== 'announced' && eventProduct.status !== 'available')
    ) {
      throw new ConvexError('Der Artikel ist nicht mehr verfügbar.');
    }
    const event = await ctx.db.get(offer.eventId);
    const now = Date.now();
    if (accept && (!event || !areOffersOpen(offerWindow({ event, eventProduct }), now))) {
      throw new ConvexError(OFFERS_NOT_OPEN);
    }
    const others = await ctx.db
      .query('productOffers')
      .withIndex('by_eventProduct', (q) => q.eq('eventProductId', offer.eventProductId))
      .collect();
    if (accept && others.some((other) => other.status === 'accepted')) {
      throw new ConvexError('Du hast für diesen Artikel bereits einen Vorschlag angenommen.');
    }

    await ctx.db.patch(offerId, { status: accept ? 'accepted' : 'rejected', respondedAt: now });
    await notifyUser(ctx, offer.buyerId, {
      subject: accept
        ? `Dein Preisvorschlag für „${product.title}“ wurde angenommen`
        : `Dein Preisvorschlag für „${product.title}“ wurde abgelehnt`,
      heading: accept ? 'Vorschlag angenommen' : 'Vorschlag abgelehnt',
      paragraphs: accept
        ? [
            `Der Verkäufer ist mit ${formatEuro(offer.amount)} für „${product.title}“ einverstanden.`,
            `Bezahlt wird vor Ort bei „${event?.title ?? 'der Veranstaltung'}“. Nenne an der Kasse deinen Namen, dort ist der vereinbarte Preis hinterlegt.`,
          ]
        : [
            `Der Verkäufer möchte „${product.title}“ nicht für ${formatEuro(offer.amount)} verkaufen. Du kannst einen neuen Vorschlag machen.`,
          ],
      link: { label: 'Artikel ansehen', path: `/products/view/${product._id}` },
    });

    if (!accept) return;

    for (const other of others) {
      if (other._id === offerId || other.status !== 'pending') continue;
      await ctx.db.patch(other._id, { status: 'rejected', respondedAt: now });
      await notifyUser(ctx, other.buyerId, {
        subject: `Dein Preisvorschlag für „${product.title}“ wurde abgelehnt`,
        heading: 'Vorschlag abgelehnt',
        paragraphs: [
          `Der Verkäufer hat für „${product.title}“ einen anderen Vorschlag angenommen.`,
        ],
        link: { label: 'Artikel ansehen', path: `/products/view/${product._id}` },
      });
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

/** Number of open offers per product of the current user (for the "my products" badges). */
export async function countPendingOffers(ctx: QueryCtx, productId: Id<'products'>) {
  const offers = await ctx.db
    .query('productOffers')
    .withIndex('by_product', (q) => q.eq('productId', productId))
    .collect();
  return offers.filter((offer) => offer.status === 'pending').length;
}

/**
 * Closes the open and accepted offers of an event item that can no longer be bought
 * through them (sold, or the listing removed), and tells the buyers.
 */
export async function closeOffersForEventProduct(
  ctx: MutationCtx,
  eventProductId: Id<'eventProducts'>,
  productTitle: string
) {
  const offers = await ctx.db
    .query('productOffers')
    .withIndex('by_eventProduct', (q) => q.eq('eventProductId', eventProductId))
    .collect();
  const now = Date.now();
  for (const offer of offers) {
    if (offer.status !== 'pending' && offer.status !== 'accepted') continue;
    await ctx.db.patch(offer._id, { status: 'rejected', respondedAt: now });
    await notifyUser(ctx, offer.buyerId, {
      subject: `„${productTitle}“ ist nicht mehr verfügbar`,
      heading: 'Artikel nicht mehr verfügbar',
      paragraphs: [
        `„${productTitle}“ ist nicht mehr erhältlich, dein Preisvorschlag über ${formatEuro(offer.amount)} ist damit hinfällig.`,
      ],
    });
  }
}
