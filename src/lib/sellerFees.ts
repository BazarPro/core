import { formatPriceDE } from './utils';
import { resolveEventFeatures, type StoredEventFeatures } from '../shared/eventFeatures';
import { formatBerlinRange, formatBerlinTime } from '../shared/berlinTime';
import i18n, { currentLocale } from '../i18n';
import { dateLocale } from '../i18n/format';
import { REQUIRABLE_FIELDS } from '../shared/categoryFields';
import { categoryFieldText } from '../i18n/categoryFields';

function text(key: string, values?: Record<string, unknown>): string {
  return i18n.t(`conditions.${key}` as never, { ns: 'events', ...values }) as string;
}

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

export function feeLockHint(lock: 'running' | 'sellers'): string {
  return i18n.t(`feeLock.${lock}` as never, { ns: 'organizer' }) as string;
}

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
    lines.push(text('commissionLine', { percent: formatPercent(commission) }));
  }
  if (intakeFee > 0) {
    lines.push(text('intakeFeeLine', { fee: formatPriceDE(intakeFee) }));
  }
  if (lines.length === 0) return { lines, example: null };

  const revenue = EXAMPLE.sold * EXAMPLE.price;
  const rows: ExampleRow[] = [
    {
      label: text('exampleSold', { sold: EXAMPLE.sold, price: formatPriceDE(EXAMPLE.price) }),
      amount: revenue,
    },
  ];
  if (commission > 0) {
    rows.push({
      label: text('exampleCommission', { percent: formatPercent(commission) }),
      amount: -Math.round(revenue * commission) / 100,
    });
  }
  if (intakeFee > 0) {
    rows.push({
      label: text('exampleIntakeFee', {
        handedIn: EXAMPLE.handedIn,
        fee: formatPriceDE(intakeFee),
      }),
      amount: -Math.round(EXAMPLE.handedIn * intakeFee * 100) / 100,
    });
  }
  const total = Math.round(rows.reduce((sum, row) => sum + row.amount, 0) * 100) / 100;
  return {
    lines,
    example: {
      intro: text('exampleIntro', {
        handedIn: EXAMPLE.handedIn,
        sold: EXAMPLE.sold,
        price: formatPriceDE(EXAMPLE.price),
      }),
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
        ? text('maxItems', { max: features.maxItemsPerSeller })
        : text('unlimitedItems'),
      allowed: true,
    },
    {
      text: features.photosOptional ? text('photosOptional') : text('photosRequired'),
      allowed: true,
    },
  ];
  const required = REQUIRABLE_FIELDS.filter((field) =>
    features.requiredFields?.includes(field.key)
  );
  if (required.length > 0) {
    rules.push({
      text: text('requiredFields', {
        fields: required
          .map((field) => categoryFieldText(field, 'label') ?? field.label)
          .join(', '),
      }),
      allowed: true,
    });
  }
  if (features.privateSellersOnly) {
    rules.push({ text: text('privateSellers'), allowed: true });
  }
  if (features.fixedSellerData) {
    rules.push({ text: text('fixedData'), allowed: true });
  }
  if (features.discounts) {
    rules.push({
      text:
        features.discountStartsAt !== undefined
          ? text('discountsFrom', {
              time: formatBerlinTime(features.discountStartsAt),
              percent: features.maxDiscountPercent,
            })
          : text('discounts', { percent: features.maxDiscountPercent }),
      allowed: true,
    });
  } else {
    rules.push({ text: text('noDiscounts'), allowed: false });
  }
  rules.push(
    features.priceOffers
      ? { text: text('offers'), allowed: true }
      : { text: text('noOffers'), allowed: false },
    features.minimumPrice
      ? { text: text('minimumPrice'), allowed: true }
      : { text: text('noMinimumPrice'), allowed: false }
  );
  if (features.questions) {
    rules.push({
      text: features.questionsDuringEventOnly ? text('questionsDuringEvent') : text('questions'),
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
      label: text('dropoff'),
      value: formatBerlinRange(logistics.dropoffStart, logistics.dropoffEnd, currentLocale()),
    });
  }
  if (logistics.pickupStart !== undefined) {
    rows.push({
      label: text('pickup'),
      value: formatBerlinRange(logistics.pickupStart, logistics.pickupEnd, currentLocale()),
    });
  }
  return { rows, note: logistics.note?.trim() || undefined };
}

export function formatSignedEuro(amount: number) {
  const sign = amount < 0 ? '−' : amount > 0 ? '+' : '';
  return `${sign}${formatPriceDE(Math.abs(amount))} €`;
}

function formatPercent(value: number) {
  return value.toLocaleString(dateLocale(), { maximumFractionDigits: 1 });
}
