import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { hasAnyEventRoleOrAdmin } from './eventRoles';
import { resolveEventFeatures } from './eventFeatures';
import { closeOffersForEventProduct, currentListPrice } from './offers';
import { describeAttributes } from './categoryFields';
import { getFieldsForCategory } from './products';
import { formatEuro, notifyAddress, notifyUser } from './notifications';
import { EMAIL_PATTERN, type PurchasePriceSource } from './constants';

/**
 * Marks a product as sold and creates a purchase record.
 * The price is the list price (incl. discount) unless an accepted online offer is
 * redeemed (`offerId`) or the cash desk negotiated a price down to the seller's
 * minimum price (`negotiatedPrice`, events with the minimum price feature only).
 * @param args.eventProductId - ID of the event-product relation to sell
 * @param args.buyerEmail - Optional address the purchase receipt is sent to
 * @returns Promise<Id<'purchase'>> - ID of the created purchase record
 */
export const sellProduct = mutation({
  args: {
    eventProductId: v.id('eventProducts'),
    offerId: v.optional(v.id('productOffers')),
    negotiatedPrice: v.optional(v.number()),
    buyerEmail: v.optional(v.string()),
  },
  handler: async (ctx, { eventProductId, offerId, negotiatedPrice, buyerEmail }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    const ep = await ctx.db.get(eventProductId);
    if (!ep) throw new Error('Event-product relation not found');

    if (!(await hasAnyEventRoleOrAdmin(ctx, ep.eventId, userId, ['organizer', 'coorganizer']))) {
      throw new Error('Not authorized to sell products for this event');
    }

    const event = await ctx.db.get(ep.eventId);
    if (!event) throw new Error('Event not found');

    const product = await ctx.db.get(ep.productId);
    if (!product) throw new Error('Product not found');

    const sellerRow = await ctx.db
      .query('eventSeller')
      .withIndex('by_event_user', (q) => q.eq('event', ep.eventId).eq('user', product.vendorId))
      .first();
    if (sellerRow?.payoutReceived) {
      throw new Error(
        'Verkäufer wurde bereits ausbezahlt, weitere Verkäufe sind nicht mehr möglich.'
      );
    }

    if (ep.status !== 'available') {
      throw new Error('Product is not available for sale');
    }

    if (offerId && negotiatedPrice !== undefined) {
      throw new Error('Entweder ein angenommener Vorschlag oder ein verhandelter Preis.');
    }
    const receiptAddress = buyerEmail?.trim();
    if (receiptAddress && !EMAIL_PATTERN.test(receiptAddress)) {
      throw new Error('Bitte gib eine gültige E-Mail-Adresse für den Beleg ein.');
    }

    // Calculate commission and payout with discount, accepted offer or negotiated price
    const listPrice = currentListPrice(product, ep);
    let totalAmount = listPrice;
    let discountPercent = ep.discountPercent;
    let priceSource: PurchasePriceSource = 'list';

    if (offerId) {
      const offer = await ctx.db.get(offerId);
      if (!offer || offer.eventProductId !== eventProductId || offer.status !== 'accepted') {
        throw new Error('Der Preisvorschlag ist nicht (mehr) angenommen.');
      }
      totalAmount = Math.min(offer.amount, listPrice);
      discountPercent = undefined;
      priceSource = 'offer';
    } else if (negotiatedPrice !== undefined) {
      const features = resolveEventFeatures(event);
      if (!features.minimumPrice || product.minimumPrice === undefined) {
        throw new Error('Für diesen Artikel ist kein Verhandlungspreis vorgesehen.');
      }
      const rounded = Math.round(negotiatedPrice * 100) / 100;
      if (!Number.isFinite(rounded) || rounded < product.minimumPrice || rounded > listPrice) {
        throw new Error(
          `Der Preis muss zwischen ${formatEuro(product.minimumPrice)} und ${formatEuro(listPrice)} liegen.`
        );
      }
      totalAmount = rounded;
      discountPercent = undefined;
      priceSource = 'negotiated';
    }

    const commissionPercentage = event.commission;
    const commissionAmount = (totalAmount * commissionPercentage) / 100;
    const payoutAmount = totalAmount - commissionAmount;

    // Update status to sold
    await ctx.db.patch(eventProductId, { status: 'sold' });

    // The redeemed offer cannot be used again; every other open offer is void now.
    if (offerId) {
      await ctx.db.patch(offerId, { status: 'redeemed', respondedAt: Date.now() });
    }
    await closeOffersForEventProduct(ctx, eventProductId, product.title);

    // Mark product itself as sold (optional, depending on global state preference)
    await ctx.db.patch(product._id, { sold: true });

    // Remove the product from all other events (keep only the sold event)
    const otherEventProducts = await ctx.db
      .query('eventProducts')
      .withIndex('by_productId', (q) => q.eq('productId', product._id))
      .collect();
    for (const relation of otherEventProducts) {
      if (relation.eventId !== ep.eventId) {
        await closeOffersForEventProduct(ctx, relation._id, product.title);
        await ctx.db.delete(relation._id);
      }
    }

    // Create purchase record
    const purchaseId = await ctx.db.insert('purchase', {
      product: product._id,
      event: event._id,
      seller: product.vendorId,
      totalAmount,
      comissionAmount: commissionAmount,
      payoutAmount,
      payoutStatus: false,
      payoutDate: 0, // Not paid out yet
      discountPercent,
      listPrice: product.price,
      priceSource,
      offerId,
    });

    await notifyUser(ctx, product.vendorId, {
      subject: `Verkauft: ${product.title}`,
      heading: 'Dein Artikel wurde verkauft',
      paragraphs: [`„${product.title}“ wurde bei „${event.title}“ verkauft.`],
      details: [
        { label: 'Verkaufspreis', value: formatEuro(totalAmount) },
        { label: 'Provision', value: formatEuro(commissionAmount) },
        { label: 'Auszahlung', value: formatEuro(payoutAmount) },
      ],
      link: { label: 'Meine Artikel', path: '/my-products' },
      footnote: 'Die Auszahlung erhältst du vom Veranstalter.',
    });

    if (receiptAddress) {
      const fields = await getFieldsForCategory(ctx, product.productCategory);
      await notifyAddress(ctx, receiptAddress, {
        subject: `Dein Kaufbeleg: ${product.title}`,
        heading: 'Vielen Dank für deinen Einkauf',
        paragraphs: [
          `Du hast bei „${event.title}“ folgenden Artikel gekauft. Verkauft wird er von einer Privatperson, die Veranstaltung vermittelt nur.`,
        ],
        details: [
          { label: 'Artikel', value: product.title },
          ...describeAttributes(fields, product.attributes),
          { label: 'Bezahlt', value: formatEuro(totalAmount) },
        ],
        link: { label: 'Artikel ansehen', path: `/products/view/${product._id}` },
        footnote:
          'Bitte bewahre diese E-Mail als Beleg auf. Deine Adresse wurde nur für diesen Beleg verwendet und nicht gespeichert.',
      });
    }

    return purchaseId;
  },
});

/**
 * Undoes a product sale (requires feature flag)
 * @param args.eventProductId - ID of the event-product relation to undo
 * @returns Promise<{success: boolean}> - Success status
 */
export const undoSale = mutation({
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

    if (ep.status !== 'sold') {
      throw new Error('Produkt ist nicht als verkauft markiert');
    }

    const product = await ctx.db.get(ep.productId);
    if (!product) throw new Error('Product not found');

    // Find and delete purchase record
    const purchase = await ctx.db
      .query('purchase')
      .withIndex('by_event_seller', (q) => q.eq('event', ep.eventId).eq('seller', product.vendorId))
      .filter((q) => q.eq(q.field('product'), ep.productId))
      .first();

    if (purchase) {
      // Give the buyer their deal back, so the offer can be redeemed on the next sale.
      if (purchase.offerId) {
        const offer = await ctx.db.get(purchase.offerId);
        if (offer?.status === 'redeemed') {
          await ctx.db.patch(offer._id, { status: 'accepted' });
        }
      }
      await ctx.db.delete(purchase._id);
    }

    // Reset statuses
    await ctx.db.patch(eventProductId, { status: 'available' });
    await ctx.db.patch(ep.productId, { sold: false });

    return { success: true };
  },
});

/**
 * Gets all purchases for a specific event
 * @param args.eventId - ID of the event
 * @returns Promise<Doc<'purchase'>[]> - Array of purchase records for the event
 */
export const getPurchasesForEvent = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, { eventId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    if (!(await hasAnyEventRoleOrAdmin(ctx, eventId, userId, ['organizer', 'coorganizer']))) {
      throw new Error('Not authorized');
    }

    return await ctx.db
      .query('purchase')
      .filter((q) => q.eq(q.field('event'), eventId))
      .collect();
  },
});
