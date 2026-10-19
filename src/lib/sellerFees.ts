import { formatPriceDE } from './utils';
import { resolveEventFeatures, type StoredEventFeatures } from '../../convex/eventFeatures';
import { formatBerlinRange, formatBerlinTime } from '../../convex/berlinTime';

export interface SellerFees {
  /** Percent of the sale price kept by the organizer */
  commission: number;
  /** Fixed € per accepted item, sold or not */
  intakeFee?: number;
}

/** What sellers agree to when they register; all of it comes from the event. */
export interface SellerConditionsEvent {
  commission: number;
  features?: StoredEventFeatures;
  sellerLogistics?: {
    dropoffStart?: number;
    dropoffEnd?: number;
    pickupStart?: number;
    pickupEnd?: number;
    note?: string;
  };
}

/** Why fees cannot change freely: the bazaar runs (fixed), or sellers registered (only down). */
export type FeeLock = 'running' | 'sellers' | null;

export const FEE_LOCK_HINT: Record<'running' | 'sellers', string> = {
  running:
    'Während der Veranstaltung nicht änderbar, damit alle Verkäufe gleich abgerechnet werden.',
  sellers:
    'Verkäufer haben sich mit dieser Gebühr angemeldet und sich darauf eingestellt. Du kannst sie nur noch senken.',
};

/** Example for sellers: 10 items handed in, 6 of them sold for 5 € each. */
const EXAMPLE = { handedIn: 10, sold: 6, price: 5 };

export interface ExampleRow {
  label: string;
  /** Signed: income positive, fees negative */
  amount: number;
}

export interface FeeExample {
  intro: string;
  rows: ExampleRow[];
  /** Payout when positive, otherwise what the seller pays */
  total: number;
}

/** What sellers pay, in plain words, with a worked example; empty without fees. */
export function describeSellerFees({ commission, intakeFee = 0 }: SellerFees): {
  lines: string[];
  example: FeeExample | null;
} {
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
  const rows: ExampleRow[] = [
    { label: `${EXAMPLE.sold} × ${formatPriceDE(EXAMPLE.price)} € verkauft`, amount: revenue },
  ];
  if (commission > 0) {
    rows.push({
      label: `${formatPercent(commission)} % Provision`,
      amount: -Math.round(revenue * commission) / 100,
    });
  }
  if (intakeFee > 0) {
    rows.push({
      label: `Annahmegebühr ${EXAMPLE.handedIn} × ${formatPriceDE(intakeFee)} €`,
      amount: -Math.round(EXAMPLE.handedIn * intakeFee * 100) / 100,
    });
  }
  const total = Math.round(rows.reduce((sum, row) => sum + row.amount, 0) * 100) / 100;
  return {
    lines,
    example: {
      intro: `Du gibst ${EXAMPLE.handedIn} Artikel ab, ${EXAMPLE.sold} davon werden für je ${formatPriceDE(EXAMPLE.price)} € verkauft.`,
      rows,
      total,
    },
  };
}

export interface SellerRule {
  text: string;
  /** false for something the bazaar does not offer */
  allowed: boolean;
}

/** Item limit, photos and the price features of the bazaar, as sellers read them. */
export function describeSellerRules(event: SellerConditionsEvent): SellerRule[] {
  const features = resolveEventFeatures(event);
  const rules: SellerRule[] = [
    {
      text: features.maxItemsPerSeller
        ? `Bis zu ${features.maxItemsPerSeller} Artikel pro Verkäufer`
        : 'Beliebig viele Artikel pro Verkäufer',
      allowed: true,
    },
    {
      text: features.photosOptional
        ? 'Fotos sind freiwillig'
        : 'Jeder Artikel braucht mindestens ein Foto',
      allowed: true,
    },
  ];
  if (features.discounts) {
    const from =
      features.discountStartsAt !== undefined
        ? ` ab ${formatBerlinTime(features.discountStartsAt)} Uhr`
        : '';
    rules.push({
      text: `Während des Basars${from} kannst du deine Preise um bis zu ${features.maxDiscountPercent} % senken`,
      allowed: true,
    });
  } else {
    rules.push({ text: 'Keine Rabatte während des Basars', allowed: false });
  }
  rules.push(
    features.priceOffers
      ? { text: 'Käufer können dir online Preise vorschlagen, du entscheidest', allowed: true }
      : { text: 'Keine Preisvorschläge von Käufern', allowed: false },
    features.minimumPrice
      ? {
          text: 'Verhandeln an der Kasse: Du legst einen Mindestpreis fest, bis zu dem die Kasse heruntergehen darf',
          allowed: true,
        }
      : { text: 'Kein Verhandeln an der Kasse, es gilt dein Preis', allowed: false }
  );
  if (features.questions) {
    rules.push({
      text: 'Käufer können öffentlich Fragen zu deinen Artikeln stellen',
      allowed: true,
    });
  }
  return rules;
}

/** Hand-in and pickup times, empty when the organizer has not set them. */
export function describeSellerSchedule(event: SellerConditionsEvent) {
  const logistics = event.sellerLogistics ?? {};
  const rows: { label: string; value: string }[] = [];
  if (logistics.dropoffStart !== undefined) {
    rows.push({
      label: 'Abgabe',
      value: formatBerlinRange(logistics.dropoffStart, logistics.dropoffEnd),
    });
  }
  if (logistics.pickupStart !== undefined) {
    rows.push({
      label: 'Abholung',
      value: formatBerlinRange(logistics.pickupStart, logistics.pickupEnd),
    });
  }
  return { rows, note: logistics.note?.trim() || undefined };
}

export function formatSignedEuro(amount: number) {
  const sign = amount < 0 ? '−' : amount > 0 ? '+' : '';
  return `${sign}${formatPriceDE(Math.abs(amount))} €`;
}

function formatPercent(value: number) {
  return value.toLocaleString('de-DE', { maximumFractionDigits: 1 });
}
