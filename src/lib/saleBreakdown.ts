import type { SaleInfo } from './api/types';
import { discountedPrice } from '../shared/eventFeatures';
import i18n from '../i18n';

/** Copy of the receipt: the buyer's, or the seller's with the bazaar fee deducted. */
export type InvoiceCopy = 'buyer' | 'seller';

export interface PriceLine {
  label: string;
  amount: number;
  /** `total` lines are the result of the lines above. */
  kind: 'base' | 'deduction' | 'total';
}

const CENT = 0.005;

/** Fee in percent as it was charged, e.g. 10 for 10 %. */
export function feePercent(sale: Pick<SaleInfo, 'commission' | 'totalAmount'>): number | null {
  if (sale.totalAmount <= 0) return null;
  return Math.round((sale.commission / sale.totalAmount) * 1000) / 10;
}

/** Short label for how the paid price came about. */
export function priceSourceLabel(sale: SaleInfo): string | null {
  if (sale.priceSource === 'offer') return text('price.offer');
  if (sale.priceSource === 'negotiated') return text('price.negotiated');
  if (sale.discountPercent) return text('price.discount', { percent: sale.discountPercent });
  return null;
}

function text(key: string, values?: Record<string, unknown>): string {
  return i18n.t(key as never, { ns: 'sales', ...values }) as string;
}

/**
 * How the price came about, from the label price to what the buyer paid. The seller's
 * copy goes on to the bazaar fee and the payout.
 */
export function buildPriceLines(sale: SaleInfo, copy: InvoiceCopy): PriceLine[] {
  const lines: PriceLine[] = [{ label: text('price.label'), amount: sale.listPrice, kind: 'base' }];
  const reduction = sale.listPrice - sale.totalAmount;

  if (reduction > CENT) {
    const label =
      sale.priceSource === 'offer'
        ? text('price.viaOffer')
        : sale.priceSource === 'negotiated'
          ? text('price.viaNegotiation')
          : sale.discountPercent
            ? text('price.discountLine', { percent: sale.discountPercent })
            : text('price.reduction');
    lines.push({ label, amount: -reduction, kind: 'deduction' });
  }
  lines.push({ label: text('price.salePrice'), amount: sale.totalAmount, kind: 'total' });

  if (copy === 'seller') {
    const percent = feePercent(sale);
    lines.push({
      label:
        percent === null
          ? text('price.fee')
          : text('price.feePercent', { percent: formatPercent(percent) }),
      amount: -sale.commission,
      kind: 'deduction',
    });
    lines.push({ label: text('price.payout'), amount: sale.payout, kind: 'total' });
  }
  return lines;
}

/** Sale data for a receipt printed right after the sale, before the query caught up. */
export function provisionalSale(
  price: number,
  discountPercent: number | undefined,
  paid: number,
  viaOffer = false
): SaleInfo {
  const listAfterDiscount = discountedPrice(price, discountPercent);
  const atList = !viaOffer && Math.abs(paid - listAfterDiscount) < CENT;
  return {
    listPrice: price,
    discountPercent: atList ? discountPercent : undefined,
    priceSource: viaOffer ? 'offer' : atList ? 'list' : 'negotiated',
    totalAmount: paid,
    commission: 0,
    payout: paid,
    soldAt: Date.now(),
  };
}

function formatPercent(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
}
