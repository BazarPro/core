import { query, mutation, type MutationCtx } from './_generated/server';
import { ConvexError, v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { assertVendorNotPaidOut, hasAnyEventRoleOrAdmin } from './eventRoles';
import { resolveEventFeatures } from './eventFeatures';
import { closeOffersForEventProduct, currentListPrice, reopenClosedOffers } from './offers';
import { describeAttributes } from './categoryFields';
import { getFieldsForCategory } from './products';
import { formatEuro, notifyAddress, notifyUser } from './notifications';
import { EMAIL_PATTERN, type PurchasePriceSource } from './constants';
import { toSaleInfo, type SaleInfo } from './sales';
import type { Doc, Id } from './_generated/dataModel';

interface SaleRequest {
  eventProductId: Id<'eventProducts'>;
  offerId?: Id<'productOffers'>;
  negotiatedPrice?: number;
}

interface SoldItem {
  purchaseId: Id<'purchase'>;
  product: Doc<'products'>;
  totalAmount: number;
  commissionAmount: number;
  payoutAmount: number;
}

const saleRequestFields = {
  eventProductId: v.id('eventProducts'),
  offerId: v.optional(v.id('productOffers')),
  negotiatedPrice: v.optional(v.number()),
};

/** A cart holds what one buyer takes home; more than this is a typing or scanning error. */
const MAX_CART_ITEMS = 100;

function validReceiptAddress(buyerEmail: string | undefined): string | undefined {
  const address = buyerEmail?.trim();
  if (address && !EMAIL_PATTERN.test(address)) {
    throw new Error('Bitte gib eine gültige E-Mail-Adresse für den Beleg ein.');
  }
  return address || undefined;
}

/**
 * Sells one item of an event: checks, price (list price incl. discount, a redeemed
 * offer or a negotiated price), purchase record and closing its offers. Emails are
 * sent by the caller, so a cart can bundle them.
 */
async function sellEventProduct(
  ctx: MutationCtx,
  userId: Id<'users'>,
  { eventProductId, offerId, negotiatedPrice }: SaleRequest
): Promise<{ event: Doc<'events'>; sold: SoldItem }> {
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
    if (product.minimumPrice >= listPrice) {
      throw new Error(
        'Der Etikettpreis liegt nicht über dem Mindestpreis, ein Verhandlungspreis ist nicht möglich.'
      );
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
  await closeOffersForEventProduct(ctx, eventProductId, product.title, 'sale');

  // Mark product itself as sold (optional, depending on global state preference)
  await ctx.db.patch(product._id, { sold: true });

  // Remove the product from all other events (keep only the sold event)
  const otherEventProducts = await ctx.db
    .query('eventProducts')
    .withIndex('by_productId', (q) => q.eq('productId', product._id))
    .collect();
  for (const relation of otherEventProducts) {
    if (relation.eventId !== ep.eventId) {
      await closeOffersForEventProduct(ctx, relation._id, product.title, 'removed');
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

  return {
    event,
    sold: { purchaseId, product, totalAmount, commissionAmount, payoutAmount },
  };
}

/** One email per seller: a single item as before, several items as a list with the total. */
async function notifySellerAboutSales(
  ctx: MutationCtx,
  event: Doc<'events'>,
  vendorId: Id<'users'>,
  items: SoldItem[]
) {
  if (items.length === 1) {
    const [item] = items;
    await notifyUser(
      ctx,
      vendorId,
      {
        subject: `Verkauft: ${item.product.title}`,
        heading: 'Dein Artikel wurde verkauft',
        paragraphs: [`„${item.product.title}“ wurde bei „${event.title}“ verkauft.`],
        details: [
          { label: 'Verkaufspreis', value: formatEuro(item.totalAmount) },
          { label: 'Provision', value: formatEuro(item.commissionAmount) },
          { label: 'Auszahlung', value: formatEuro(item.payoutAmount) },
        ],
        link: { label: 'Meine Artikel', path: '/my-products' },
        footnote: 'Die Auszahlung erhältst du vom Veranstalter.',
      },
      'sales'
    );
    return;
  }
  const sum = (key: 'totalAmount' | 'commissionAmount' | 'payoutAmount') =>
    items.reduce((total, item) => total + item[key], 0);
  await notifyUser(
    ctx,
    vendorId,
    {
      subject: `Verkauft: ${items.length} Artikel bei ${event.title}`,
      heading: `${items.length} Artikel verkauft`,
      paragraphs: [`Bei „${event.title}“ wurden gerade ${items.length} deiner Artikel verkauft.`],
      details: [
        ...items.map((item) => ({
          label: item.product.title,
          value: formatEuro(item.totalAmount),
        })),
        { label: 'Provision', value: formatEuro(sum('commissionAmount')) },
        { label: 'Auszahlung', value: formatEuro(sum('payoutAmount')) },
      ],
      link: { label: 'Meine Verkäufe', path: '/my-sales' },
      footnote: 'Die Auszahlung erhältst du vom Veranstalter.',
    },
    'sales'
  );
}

/** Purchase receipt for the buyer; the address is used for this email only. */
async function sendReceipt(
  ctx: MutationCtx,
  address: string,
  event: Doc<'events'>,
  items: SoldItem[]
) {
  const footnote =
    'Bitte bewahre diese E-Mail als Beleg auf. Deine Adresse wurde nur für diesen Beleg verwendet und nicht gespeichert.';
  if (items.length === 1) {
    const [{ product, totalAmount }] = items;
    const fields = await getFieldsForCategory(ctx, product.productCategory);
    await notifyAddress(ctx, address, {
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
      footnote,
    });
    return;
  }
  await notifyAddress(ctx, address, {
    subject: `Dein Kaufbeleg: ${items.length} Artikel bei ${event.title}`,
    heading: 'Vielen Dank für deinen Einkauf',
    paragraphs: [
      `Du hast bei „${event.title}“ folgende Artikel gekauft. Verkauft werden sie von Privatpersonen, die Veranstaltung vermittelt nur.`,
    ],
    details: [
      ...items.map((item) => ({ label: item.product.title, value: formatEuro(item.totalAmount) })),
      {
        label: 'Bezahlt',
        value: formatEuro(items.reduce((total, item) => total + item.totalAmount, 0)),
      },
    ],
    footnote,
  });
}

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
  args: { ...saleRequestFields, buyerEmail: v.optional(v.string()) },
  handler: async (ctx, { buyerEmail, ...request }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    const receiptAddress = validReceiptAddress(buyerEmail);

    const { event, sold } = await sellEventProduct(ctx, userId, request);
    await notifySellerAboutSales(ctx, event, sold.product.vendorId, [sold]);
    if (receiptAddress) await sendReceipt(ctx, receiptAddress, event, [sold]);
    return sold.purchaseId;
  },
});

/**
 * Cash desk with a cart: sells all items of one buyer in one transaction. If one item
 * cannot be sold (sold at another desk meanwhile, seller already paid out, price not
 * allowed), nothing is sold and the error names the item.
 * Sellers get one email for all their items, the buyer one receipt.
 */
export const sellProducts = mutation({
  args: {
    items: v.array(v.object(saleRequestFields)),
    buyerEmail: v.optional(v.string()),
  },
  handler: async (ctx, { items, buyerEmail }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    if (items.length === 0) throw new ConvexError('Der Warenkorb ist leer.');
    if (items.length > MAX_CART_ITEMS) {
      throw new ConvexError(`Höchstens ${MAX_CART_ITEMS} Artikel pro Verkauf.`);
    }
    if (new Set(items.map((item) => item.eventProductId)).size !== items.length) {
      throw new ConvexError('Ein Artikel liegt doppelt im Warenkorb.');
    }
    const receiptAddress = validReceiptAddress(buyerEmail);

    let event: Doc<'events'> | null = null;
    const sold: SoldItem[] = [];
    for (const item of items) {
      try {
        const result = await sellEventProduct(ctx, userId, item);
        if (event && result.event._id !== event._id) {
          throw new Error('Alle Artikel eines Verkaufs müssen zur selben Veranstaltung gehören.');
        }
        event = result.event;
        sold.push(result.sold);
      } catch (error) {
        // The mutation is rolled back as a whole; tell the cash desk which item failed
        const ep = await ctx.db.get(item.eventProductId);
        const product = ep ? await ctx.db.get(ep.productId) : null;
        const reason = error instanceof Error ? error.message : String(error);
        throw new ConvexError(product ? `„${product.title}“: ${reason}` : reason);
      }
    }
    if (!event) throw new ConvexError('Der Warenkorb ist leer.');

    const byVendor = new Map<Id<'users'>, SoldItem[]>();
    for (const item of sold) {
      const list = byVendor.get(item.product.vendorId) ?? [];
      list.push(item);
      byVendor.set(item.product.vendorId, list);
    }
    for (const [vendorId, vendorItems] of byVendor) {
      await notifySellerAboutSales(ctx, event, vendorId, vendorItems);
    }
    if (receiptAddress) await sendReceipt(ctx, receiptAddress, event, sold);

    return {
      purchaseIds: sold.map((item) => item.purchaseId),
      total: sold.reduce((total, item) => total + item.totalAmount, 0),
    };
  },
});

/**
 * One line of the cash desk cart: the scanned item of this event with its current price.
 * Reactive, so a sale at another desk shows up right away. Event team and admins only.
 */
export const getCheckoutItem = query({
  args: { eventId: v.id('events'), productId: v.id('products') },
  handler: async (ctx, { eventId, productId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    if (!(await hasAnyEventRoleOrAdmin(ctx, eventId, userId, ['organizer', 'coorganizer']))) {
      throw new Error('Not authorized');
    }
    const [event, product, ep] = await Promise.all([
      ctx.db.get(eventId),
      ctx.db.get(productId),
      ctx.db
        .query('eventProducts')
        .withIndex('by_eventId_productId', (q) =>
          q.eq('eventId', eventId).eq('productId', productId)
        )
        .first(),
    ]);
    if (!event || !product || !ep) return null;

    const sellerRow = await ctx.db
      .query('eventSeller')
      .withIndex('by_event_user', (q) => q.eq('event', eventId).eq('user', product.vendorId))
      .first();
    const listPrice = currentListPrice(product, ep);
    const fields = await getFieldsForCategory(ctx, product.productCategory);
    const minimumPrice =
      resolveEventFeatures(event).minimumPrice &&
      product.minimumPrice !== undefined &&
      product.minimumPrice < listPrice
        ? product.minimumPrice
        : undefined;

    return {
      eventProductId: ep._id,
      productId: product._id,
      title: product.title,
      image: product.images[0] ?? null,
      status: ep.status,
      price: product.price,
      discountPercent: ep.discountPercent,
      listPrice,
      minimumPrice,
      sellerPaidOut: sellerRow?.payoutReceived ?? false,
      attributes: describeAttributes(fields, product.attributes),
    };
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
    await assertVendorNotPaidOut(ctx, ep.eventId, product.vendorId);

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
    // The other offers the sale closed are valid again
    await reopenClosedOffers(ctx, eventProductId, product.title, 'sale');

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

/**
 * The seller's sales, grouped by event: every sold item with price, fee and payout,
 * the totals and whether the organizer has paid out yet. Newest event first.
 */
export const getMySales = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const purchases = await ctx.db
      .query('purchase')
      .withIndex('by_seller', (q) => q.eq('seller', userId))
      .collect();
    const byEvent = new Map<string, typeof purchases>();
    for (const purchase of purchases) {
      const list = byEvent.get(purchase.event) ?? [];
      list.push(purchase);
      byEvent.set(purchase.event, list);
    }

    const groups = await Promise.all(
      [...byEvent.entries()].map(async ([eventId, eventPurchases]) => {
        const event = await ctx.db.get(eventId as Id<'events'>);
        if (!event) return null;
        const sellerRow = await ctx.db
          .query('eventSeller')
          .withIndex('by_event_user', (q) => q.eq('event', event._id).eq('user', userId))
          .first();
        const items = await Promise.all(
          eventPurchases.map(async (purchase) => {
            const product = await ctx.db.get(purchase.product);
            return {
              productId: purchase.product,
              title: product?.title ?? 'Gelöschter Artikel',
              description: product?.description ?? '',
              images: product?.images ?? [],
              sale: toSaleInfo(purchase),
            };
          })
        );
        items.sort((a, b) => b.sale.soldAt - a.sale.soldAt);
        const sum = (pick: (sale: SaleInfo) => number) =>
          items.reduce((acc, item) => acc + pick(item.sale), 0);
        return {
          event: {
            _id: event._id,
            title: event.title,
            startDate: event.startDate,
            endDate: event.endDate,
            commissionPercent: event.commission,
          },
          paid: sellerRow?.payoutReceived ?? false,
          items,
          totals: {
            revenue: sum((sale) => sale.totalAmount),
            commission: sum((sale) => sale.commission),
            payout: sum((sale) => sale.payout),
          },
        };
      })
    );

    return groups
      .filter((group): group is NonNullable<typeof group> => group !== null)
      .sort((a, b) => b.event.startDate - a.event.startDate);
  },
});
