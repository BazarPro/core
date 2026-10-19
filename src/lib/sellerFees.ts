import { formatPriceDE } from './utils';

export interface SellerFees {
  /** Percent of the sale price kept by the organizer */
  commission: number;
  /** Fixed € per accepted item, sold or not */
  intakeFee?: number;
}

/** Why the commission cannot change: the bazaar runs, or sellers registered with it. */
export type FeeLock = 'running' | 'sellers' | null;

export const FEE_LOCK_HINT: Record<'running' | 'sellers', string> = {
  running:
    'Während der Veranstaltung nicht änderbar, damit alle Verkäufe gleich abgerechnet werden.',
  sellers:
    'Nicht mehr änderbar: Verkäufer haben sich mit dieser Gebühr angemeldet und sich darauf eingestellt.',
};

/** Example for sellers: 10 items handed in, 6 of them sold for 5 € each. */
const EXAMPLE = { handedIn: 10, sold: 6, price: 5 };

/** What sellers pay, in plain words, with a worked example; empty without fees. */
export function describeSellerFees({ commission, intakeFee = 0 }: SellerFees) {
  const lines: string[] = [];
  if (commission > 0) {
    lines.push(
      `${formatPercent(commission)} % Provision vom Verkaufspreis jedes verkauften Artikels`
    );
  }
  if (intakeFee > 0) {
    lines.push(
      `${formatPriceDE(intakeFee)} € Annahmegebühr pro angenommenem Artikel, auch wenn er nicht verkauft wird`
    );
  }
  if (lines.length === 0) return { lines, example: null };

  const revenue = EXAMPLE.sold * EXAMPLE.price;
  const commissionAmount = Math.round(revenue * commission) / 100;
  const intakeAmount = Math.round(EXAMPLE.handedIn * intakeFee * 100) / 100;
  const payout = revenue - commissionAmount - intakeAmount;
  const parts = [`${formatPriceDE(revenue)} €`];
  if (commission > 0) parts.push(`${formatPriceDE(commissionAmount)} € Provision`);
  if (intakeFee > 0) parts.push(`${formatPriceDE(intakeAmount)} € Annahmegebühr`);
  const result =
    payout >= 0 ? `${formatPriceDE(payout)} € für dich` : `du zahlst ${formatPriceDE(-payout)} €`;
  const example =
    `Beispiel: ${EXAMPLE.handedIn} Artikel abgegeben, ${EXAMPLE.sold} für je ` +
    `${formatPriceDE(EXAMPLE.price)} € verkauft: ${parts.join(' − ')} = ${result}.`;
  return { lines, example };
}

function formatPercent(value: number) {
  return value.toLocaleString('de-DE', { maximumFractionDigits: 1 });
}
