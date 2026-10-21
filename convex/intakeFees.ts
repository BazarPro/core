import type { QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { EventProductStatus } from './constants';
import { resolveEventFeatures } from './eventFeatures';

/** Items the bazaar took in at intake; they pay the fee whether they sell or not. */
const ACCEPTED_STATUSES: EventProductStatus[] = ['available', 'sold', 'returned'];

export interface IntakeFee {
  /** Fee per item in € */
  perItem: number;
  items: number;
  /** Fee in € kept from the payout */
  total: number;
}

const NO_FEE: IntakeFee = { perItem: 0, items: 0, total: 0 };

function feeFor(perItem: number, items: number): IntakeFee {
  return { perItem, items, total: Math.round(perItem * items * 100) / 100 };
}

/** Fee as stored at payout, so later changes of the setting do not alter old settlements. */
function storedFee(sellerRow: Doc<'eventSeller'> | null | undefined): IntakeFee | null {
  if (!sellerRow?.payoutReceived || sellerRow.intakeFee === undefined) return null;
  const items = sellerRow.intakeFeeItems ?? 0;
  return {
    perItem: items > 0 ? sellerRow.intakeFee / items : 0,
    items,
    total: sellerRow.intakeFee,
  };
}

/** Accepted items per seller of the event, for the event-wide views. */
export async function countAcceptedItemsBySeller(
  ctx: QueryCtx,
  eventId: Id<'events'>
): Promise<Map<Id<'users'>, number>> {
  const counts = new Map<Id<'users'>, number>();
  const relations = await ctx.db
    .query('eventProducts')
    .withIndex('by_eventId', (q) => q.eq('eventId', eventId))
    .collect();
  for (const relation of relations) {
    if (!ACCEPTED_STATUSES.includes(relation.status)) continue;
    const product = await ctx.db.get(relation.productId);
    if (product) counts.set(product.vendorId, (counts.get(product.vendorId) ?? 0) + 1);
  }
  return counts;
}

/** Intake fee of one seller, given the accepted items (see countAcceptedItemsBySeller). */
export function intakeFeeOf(
  event: Doc<'events'>,
  sellerRow: Doc<'eventSeller'> | null | undefined,
  acceptedItems: number
): IntakeFee {
  const stored = storedFee(sellerRow);
  if (stored) return stored;
  const perItem = resolveEventFeatures(event).intakeFee ?? 0;
  return perItem > 0 ? feeFor(perItem, acceptedItems) : NO_FEE;
}

/** Intake fee of one seller; reads only that seller's items. */
export async function intakeFeeForSeller(
  ctx: QueryCtx,
  event: Doc<'events'>,
  sellerId: Id<'users'>,
  sellerRow: Doc<'eventSeller'> | null | undefined
): Promise<IntakeFee> {
  const stored = storedFee(sellerRow);
  if (stored) return stored;
  const perItem = resolveEventFeatures(event).intakeFee ?? 0;
  if (perItem <= 0) return NO_FEE;
  const products = await ctx.db
    .query('products')
    .withIndex('by_vendorId', (q) => q.eq('vendorId', sellerId))
    .collect();
  let items = 0;
  for (const product of products) {
    const relation = await ctx.db
      .query('eventProducts')
      .withIndex('by_eventId_productId', (q) =>
        q.eq('eventId', event._id).eq('productId', product._id)
      )
      .first();
    if (relation && ACCEPTED_STATUSES.includes(relation.status)) items++;
  }
  return feeFor(perItem, items);
}
