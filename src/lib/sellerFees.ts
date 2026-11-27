import { formatPrice } from './utils';
import { feeCapCredit } from '../shared/feeCap';
import { compareFees, eventFees, groupFees, type FeeGroup } from '../shared/feeGroups';
import { resolveEventFeatures, type StoredEventFeatures } from '../shared/eventFeatures';
import { formatBerlinRange, formatBerlinTime } from '../shared/berlinTime';
import { feeExampleFor, type FeeExampleCase } from './eventTypes';
import i18n, { currentLocale } from '../i18n';
import { dateLocale } from '../i18n/format';
import { requirableFields, type CategoryField } from '../shared/categoryFields';
import { categoryFieldText } from '../i18n/categoryFields';
import { countryName } from '../i18n/countries';
import { formatRegion, postalRegion } from '../shared/postalCodes';
import type { Id } from './api/types';

function text(key: string, values?: Record<string, unknown>): string {
  return i18n.t(`conditions.${key}` as never, { ns: 'events', ...values }) as string;
}

export interface SellerFees {
  /** Percent of the sale price kept by the organizer */
  commission: number;
  /** Fixed € per accepted item, sold or not */
  intakeFee?: number;
  /** All fees of a seller together at most, in € */
  maxFeesPerSeller?: number;
}

/** What sellers agree to when they register; all of it comes from the event. */
export interface SellerConditionsEvent {
  commission: number;
  features?: StoredEventFeatures;
  /** Places for items left on the whole market, as the backend counts them */
  itemPlacesLeft?: number;
  /** Map of the region (#304): the rule then names the region instead of its codes */
  regionMapImage?: Id<'_storage'>;
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

/** The lock in two words under the field; the reason stands in its (i) */
export function feeLockShort(lock: 'running' | 'sellers'): string {
  return i18n.t(`feeLock.${lock}Short` as never, { ns: 'organizer' }) as string;
}

export interface FeeExample {
  /**
   * One sentence, e.g. "Verkaufst du ein Rad für 150,00 €, bekommst du 135,00 €
   * (150,00 € − 15,00 € Provision)."
   */
  text: string;
  /** Payout when positive, otherwise what the seller pays */
  total: number;
  /** The same for the fee groups whose payout differs, e.g. "Für Mitglieder: 142,50 €." */
  groups: string[];
}

/** What one seller pays for the example: the fees together and what the cap gives back. */
function exampleFees(
  { commission, intakeFee = 0, maxFeesPerSeller }: SellerFees,
  { handedIn, sold, price }: FeeExampleCase
) {
  const revenue = sold * price;
  const commissionFee = commission > 0 ? Math.round(revenue * commission) / 100 : 0;
  const intake = intakeFee > 0 ? Math.round(handedIn * intakeFee * 100) / 100 : 0;
  const full = commissionFee + intake;
  const fees = full - feeCapCredit(full, maxFeesPerSeller);
  return {
    revenue,
    commissionFee,
    intake,
    fees,
    total: Math.round((revenue - fees) * 100) / 100,
  };
}

const euro = (amount: number) => `${formatPrice(amount)} €`;

/**
 * What sellers pay, in plain words, with a worked example in one sentence that fits the
 * kind of bazaar (`features.eventType`, #303); empty without fees. Intake fee, cap and
 * fee groups only show up when the bazaar has them.
 */
export function describeSellerFees(event: SellerConditionsEvent): {
  lines: string[];
  example: FeeExample | null;
} {
  const fees = eventFees(event);
  const { commission, intakeFee = 0, maxFeesPerSeller } = fees;
  const lines: string[] = [];
  if (commission > 0) {
    lines.push(text('commissionLine', { percent: formatPercent(commission) }));
  }
  if (intakeFee > 0) {
    lines.push(text('intakeFeeLine', { fee: formatPrice(intakeFee) }));
  }
  if (lines.length === 0) return { lines, example: null };
  if (maxFeesPerSeller !== undefined) {
    lines.push(text('feeCapLine', { fee: formatPrice(maxFeesPerSeller) }));
  }

  const kind = feeExampleFor(event.features?.eventType);
  const { revenue, commissionFee, intake, fees: paid, total } = exampleFees(fees, kind);
  const items = text(`exampleItems.${kind.noun}`, { count: kind.sold, price: euro(kind.price) });
  // Without an intake fee, what is handed in but not sold costs nothing: leave it out
  const sale =
    intake > 0
      ? text('exampleHandIn', {
          handedIn: text(`exampleHandedIn.${kind.noun}`, { count: kind.handedIn }),
          items,
        })
      : text('exampleSale', { items });
  const parts =
    paid < commissionFee + intake
      ? [text('exampleCapped', { amount: euro(paid) })]
      : [
          commissionFee > 0 ? text('exampleCommission', { amount: euro(commissionFee) }) : '',
          intake > 0 ? text('exampleIntakeFee', { amount: euro(intake) }) : '',
        ].filter(Boolean);
  const exampleText = text('exampleSentence', {
    sale,
    result: text(total >= 0 ? 'exampleGet' : 'examplePay', { amount: euro(Math.abs(total)) }),
    parts: [euro(revenue), ...parts].join(' − '),
  });
  const groups = (event.features?.feeGroups ?? []).flatMap((group) => {
    const own = exampleFees(groupFees(event, group), kind).total;
    // A group dearer than the bazaar pays the bazaar's fees (appliedGroup)
    const dearer = compareFees(eventFees(event), groupFees(event, group)) < 0;
    return own === total || dearer || !group.label.trim()
      ? []
      : [text('exampleGroup', { label: group.label.trim(), amount: euro(own) })];
  });
  return { lines, example: { text: exampleText, total, groups } };
}

export interface FeeGroupTerms {
  group: FeeGroup;
  /** The group's fees in short, e.g. "5 % Provision statt 10 % · keine Annahmegebühr" */
  fees: string;
  /** How one gets in: the proof to bring, or "for helpers" */
  how: string;
}

/**
 * What a group changes against the bazaar's fees, in short: only its advantages, e.g.
 * "5 % Provision statt 10 %" or just "bis zu 40 Artikel" when the fees are the same.
 */
export function feeGroupAdvantages(event: SellerConditionsEvent, group: FeeGroup): string[] {
  const base = eventFees(event);
  const fees = groupFees(event, group);
  const parts = [
    fees.commission !== base.commission
      ? text('groupCommissionInstead', {
          percent: formatPercent(fees.commission),
          base: formatPercent(base.commission),
        })
      : undefined,
    fees.intakeFee !== base.intakeFee
      ? fees.intakeFee
        ? base.intakeFee
          ? text('groupIntakeFeeInstead', {
              fee: formatPrice(fees.intakeFee),
              base: formatPrice(base.intakeFee),
            })
          : text('groupIntakeFee', { fee: formatPrice(fees.intakeFee) })
        : text('groupNoIntakeFee')
      : undefined,
    fees.maxFeesPerSeller !== undefined && fees.maxFeesPerSeller !== base.maxFeesPerSeller
      ? text('groupCap', { fee: formatPrice(fees.maxFeesPerSeller) })
      : undefined,
    fees.maxItemsPerSeller !== undefined && fees.maxItemsPerSeller !== base.maxItemsPerSeller
      ? text('groupItems', { count: fees.maxItemsPerSeller })
      : undefined,
  ].filter((part): part is string => !!part);
  // The same as everyone: say so rather than nothing
  return parts.length > 0 ? parts : [text('groupSame')];
}

const givenNumber = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

interface FormFeeValues {
  commission?: number;
  features?: {
    intakeFee?: number;
    maxFeesPerSeller?: number;
    maxItemsPerSeller?: number;
    feeGroups?: FeeGroup[];
    eventType?: string;
  };
}

const formGroup = (group: FeeGroup): FeeGroup => ({
  ...group,
  commission: givenNumber(group.commission) ?? 0,
  intakeFee: givenNumber(group.intakeFee),
  maxFeesPerSeller: givenNumber(group.maxFeesPerSeller),
  maxItemsPerSeller: givenNumber(group.maxItemsPerSeller),
});

/**
 * The fees of the event form as an event, where empty numbers are NaN: for the previews of
 * the wizard, which explain them the same way as the conditions.
 */
export function feesFromForm(values: FormFeeValues): SellerConditionsEvent {
  const features = values.features ?? {};
  return {
    commission: Math.min(Math.max(givenNumber(values.commission) ?? 0, 0), 100),
    features: {
      intakeFee: Math.max(givenNumber(features.intakeFee) ?? 0, 0) || undefined,
      maxFeesPerSeller: givenNumber(features.maxFeesPerSeller),
      maxItemsPerSeller: givenNumber(features.maxItemsPerSeller),
      feeGroups: (features.feeGroups ?? []).map(formGroup),
      eventType: features.eventType || undefined,
    },
  };
}

/**
 * `feeGroupAdvantages` from the values of the event form, where empty numbers are NaN,
 * e.g. "5 % Provision statt 10 % · bis zu 40 Artikel".
 */
export function formGroupAdvantages(values: FormFeeValues, group: FeeGroup): string {
  return feeGroupAdvantages(feesFromForm(values), formGroup(group)).join(' · ');
}

/** The fee groups as sellers read them (#302): each with its advantages and how to get in. */
export function describeFeeGroups(event: SellerConditionsEvent): FeeGroupTerms[] {
  return (event.features?.feeGroups ?? []).map((group) => ({
    group,
    fees: feeGroupAdvantages(event, group).join(' · '),
    how:
      group.assignment === 'helpers'
        ? text('groupHelpers')
        : group.assignment === 'manual'
          ? text('groupManual')
          : group.proofHint
            ? text('groupProof', { hint: group.proofHint })
            : text('groupChecked'),
  }));
}

export interface SellerRule {
  text: string;
  /** More about it, shown on request */
  details?: string;
  /** false when it keeps the seller out, e.g. a full market */
  allowed: boolean;
  /** The region's codes in short, for the caption of its map (#304) */
  regionCodes?: string;
}

/**
 * What applies to sellers besides the fees (#303), only what the bazaar has, not what it
 * lacks: `duties` (limits, required details, ID, private sale), then `options` (discounts,
 * offers, minimum price, questions).
 */
export function describeSellerRules(
  event: SellerConditionsEvent,
  fieldDefinitions?: readonly CategoryField[]
): { duties: SellerRule[]; options: SellerRule[] } {
  const features = resolveEventFeatures(event);
  const rule = (key: string, values?: Record<string, unknown>, details?: string): SellerRule => ({
    text: text(key, values),
    details: details && text(details),
    allowed: true,
  });
  const duties: SellerRule[] = [];
  const region = postalRegion(event.features);
  if (region) {
    // Short: the map shows where, its caption the codes; the join dialog warns about the rest
    const codes = rule('region', { codes: formatRegion(region, 4, countryName) });
    duties.push(event.regionMapImage ? { ...rule('regionShort'), regionCodes: codes.text } : codes);
  }
  if (features.maxItemsPerSeller) {
    duties.push(rule('maxItems', { max: features.maxItemsPerSeller }));
  }
  if (features.maxItemsTotal) {
    const left = event.itemPlacesLeft;
    duties.push({
      ...rule(left === 0 ? 'marketFull' : left !== undefined ? 'placesLeft' : 'maxItemsTotal', {
        count: left,
        max: features.maxItemsTotal,
      }),
      allowed: left !== 0,
    });
  }
  if (!features.photosOptional) duties.push(rule('photosRequired'));
  const required = requirableFields(fieldDefinitions).filter((field) =>
    features.requiredFields?.includes(field.key)
  );
  if (required.length > 0) {
    duties.push(
      rule('requiredFields', {
        fields: required
          .map((field) => categoryFieldText(field, 'label') ?? field.label)
          .join(', '),
      })
    );
  }
  if (features.fixedSellerData) duties.push(rule('fixedData', undefined, 'fixedDataDetails'));
  if (features.privateSellersOnly) duties.push(rule('privateSellers'));
  if (features.directSale) duties.push(rule('directSale', undefined, 'directSaleDetails'));
  if (!features.publicCatalog) {
    duties.push(rule('noPublicCatalog', undefined, 'noPublicCatalogDetails'));
  }

  const options: SellerRule[] = [];
  if (features.discounts) {
    options.push(
      features.discountStartsAt !== undefined
        ? rule('discountsFrom', {
            time: formatBerlinTime(features.discountStartsAt),
            percent: features.maxDiscountPercent,
          })
        : rule('discounts', { percent: features.maxDiscountPercent })
    );
  }
  if (features.priceOffers) options.push(rule('offers'));
  if (features.minimumPrice) options.push(rule('minimumPrice'));
  if (features.questions) {
    options.push(rule(features.questionsDuringEventOnly ? 'questionsDuringEvent' : 'questions'));
  }
  return { duties, options };
}

/**
 * Hand-in and pickup times, empty when the organizer has not set them. At a direct sale
 * sellers stand at their items themselves: the same times mean setup and teardown (#299).
 */
export function describeSellerSchedule(event: SellerConditionsEvent) {
  const logistics = event.sellerLogistics ?? {};
  const direct = resolveEventFeatures(event).directSale;
  const rows: { label: string; value: string }[] = [];
  if (logistics.dropoffStart !== undefined) {
    rows.push({
      label: text(direct ? 'setup' : 'dropoff'),
      value: formatBerlinRange(logistics.dropoffStart, logistics.dropoffEnd, currentLocale()),
    });
  }
  if (logistics.pickupStart !== undefined) {
    rows.push({
      label: text(direct ? 'teardown' : 'pickup'),
      value: formatBerlinRange(logistics.pickupStart, logistics.pickupEnd, currentLocale()),
    });
  }
  return {
    title: text(direct ? 'scheduleDirect' : 'schedule'),
    rows,
    note: logistics.note?.trim() || undefined,
  };
}

export function formatSignedEuro(amount: number) {
  const sign = amount < 0 ? '−' : amount > 0 ? '+' : '';
  return `${sign}${formatPrice(Math.abs(amount))} €`;
}

export function formatPercent(value: number) {
  return value.toLocaleString(dateLocale(), { maximumFractionDigits: 1 });
}
