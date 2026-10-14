import type { Doc } from './_generated/dataModel';
import type { PurchasePriceSource } from './constants';

/** A sale as the seller, the organizer and the receipts need it. */
export interface SaleInfo {
  /** Label price of the item. */
  listPrice: number;
  /** Discount at the time of sale; only for sales at the (discounted) list price. */
  discountPercent?: number;
  priceSource: PurchasePriceSource;
  /** What the buyer paid. */
  totalAmount: number;
  /** Fee the bazaar keeps. */
  commission: number;
  /** What the seller gets. */
  payout: number;
  soldAt: number;
}

export function toSaleInfo(purchase: Doc<'purchase'>): SaleInfo {
  // Older rows have no listPrice; derive it from the discount
  const listPrice =
    purchase.listPrice ??
    (purchase.discountPercent
      ? purchase.totalAmount / (1 - purchase.discountPercent / 100)
      : purchase.totalAmount);
  return {
    listPrice,
    discountPercent: purchase.discountPercent,
    priceSource: purchase.priceSource ?? 'list',
    totalAmount: purchase.totalAmount,
    commission: purchase.comissionAmount,
    payout: purchase.payoutAmount,
    soldAt: purchase._creationTime,
  };
}
