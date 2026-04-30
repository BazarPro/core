import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';

/** Totals from all purchases for a seller at an event (source of truth when marking payout). */
export async function sumPurchasesForSellerAtEvent(
  ctx: MutationCtx,
  eventId: Id<'events'>,
  sellerId: Id<'users'>
): Promise<{
  totalFee: number;
  comissionFee: number;
  numberpayoutAmount: number;
}> {
  const purchases = await ctx.db
    .query('purchase')
    .withIndex('by_event_seller', (q) => q.eq('event', eventId).eq('seller', sellerId))
    .collect();

  return {
    totalFee: purchases.reduce((s, p) => s + p.totalAmount, 0),
    comissionFee: purchases.reduce((s, p) => s + p.comissionAmount, 0),
    numberpayoutAmount: purchases.reduce((s, p) => s + p.payoutAmount, 0),
  };
}
