import type { SaleInfo } from '../../convex/sales';
import { discountedPrice } from '../../convex/eventFeatures';

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

/** Short German label for how the paid price came about. */
export function priceSourceLabel(sale: SaleInfo): string | null {
  if (sale.priceSource === 'offer') return 'Preisvorschlag';
  if (sale.priceSource === 'negotiated') return 'VB verhandelt';
  if (sale.discountPercent) return `−${sale.discountPercent} % Rabatt`;
  return null;
}

/**
 * How the price came about, from the label price to what the buyer paid. The seller's
 * copy goes on to the bazaar fee and the payout.
 */
export function buildPriceLines(sale: SaleInfo, copy: InvoiceCopy): PriceLine[] {
  const lines: PriceLine[] = [{ label: 'Etikettpreis', amount: sale.listPrice, kind: 'base' }];
  const reduction = sale.listPrice - sale.totalAmount;

  if (reduction > CENT) {
    const label =
      sale.priceSource === 'offer'
        ? 'Nachlass durch angenommenen Preisvorschlag'
        : sale.priceSource === 'negotiated'
          ? 'Nachlass, an der Kasse verhandelt (VB)'
          : sale.discountPercent
            ? `Rabatt (${sale.discountPercent} %)`
            : 'Nachlass';
    lines.push({ label, amount: -reduction, kind: 'deduction' });
  }
  lines.push({ label: 'Verkaufspreis', amount: sale.totalAmount, kind: 'total' });

  if (copy === 'seller') {
    const percent = feePercent(sale);
    lines.push({
      label: percent === null ? 'Bazar-Gebühr' : `Bazar-Gebühr (${formatPercent(percent)} %)`,
      amount: -sale.commission,
      kind: 'deduction',
    });
    lines.push({ label: 'Auszahlung an den Verkäufer', amount: sale.payout, kind: 'total' });
  }
  return lines;
}

/** Sale data for a receipt printed right after the sale, before the query caught up. */
export function provisionalSale(
  price: number,
  discountPercent: number | undefined,
  paid: number
): SaleInfo {
  const listAfterDiscount = discountedPrice(price, discountPercent);
  const atList = Math.abs(paid - listAfterDiscount) < CENT;
  return {
    listPrice: price,
    discountPercent: atList ? discountPercent : undefined,
    priceSource: atList ? 'list' : 'negotiated',
    totalAmount: paid,
    commission: 0,
    payout: paid,
    soldAt: Date.now(),
  };
}

function formatPercent(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
}
