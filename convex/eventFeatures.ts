import type { LabelFormat } from './constants';
import type { ErrorCode } from './errors';
import type { CategoryField } from './categoryFields';
/**
 * Per-event feature switches chosen by the organizer. Pure helpers only, so the
 * frontend can import this file as well.
 */

/** Highest discount a seller may ever grant, regardless of the event setting. */
export const MAX_DISCOUNT_PERCENT = 50;

export interface EventFeatures {
  /** Sellers may discount their own items during the event. */
  discounts: boolean;
  /** Discounts may only be set from this timestamp on (e.g. 15:00 on bazaar day). */
  discountStartsAt?: number;
  /** Upper bound for discounts in this event (1–50). */
  maxDiscountPercent: number;
  /** Logged-in buyers can send price offers online, the seller accepts or rejects. */
  priceOffers: boolean;
  /** Sellers can set a minimum price; the cash desk may sell down to it (VB). */
  minimumPrice: boolean;
  /** Public questions and answers on items. */
  questions: boolean;
  /** Questions can only be asked while the event runs, not to inspect items beforehand. */
  questionsDuringEventOnly: boolean;
  /** Items without a photo are allowed, e.g. for a children's bazaar with many small items. */
  photosOptional: boolean;
  /**
   * Category fields every item of this event must have filled in (e.g. "frameNumber"),
   * as far as its category has the field.
   */
  requiredFields?: string[];
  /** Upper bound of items a seller may register for this event; unset means no limit. */
  maxItemsPerSeller?: number;
  /** Label sheet sellers print for this event. */
  labelFormat: LabelFormat;
  /** Print the price on labels; only takes effect while discounts are off. */
  priceOnLabel: boolean;
  /** Fixed fee in € per accepted item (sold or not), kept from the payout; unset means none. */
  intakeFee?: number;
}

export type StoredEventFeatures = Partial<EventFeatures>;

/**
 * Events created before features existed keep their old behaviour: discounts on
 * (up to 50 %), everything else off.
 */
export const DEFAULT_EVENT_FEATURES: EventFeatures = {
  discounts: true,
  maxDiscountPercent: MAX_DISCOUNT_PERCENT,
  priceOffers: false,
  minimumPrice: false,
  questions: false,
  questionsDuringEventOnly: false,
  photosOptional: false,
  labelFormat: 'standard',
  priceOnLabel: false,
};

export function resolveEventFeatures(event: { features?: StoredEventFeatures }): EventFeatures {
  const stored = event.features ?? {};
  const maxDiscountPercent = Math.min(
    Math.max(Math.round(stored.maxDiscountPercent ?? MAX_DISCOUNT_PERCENT), 1),
    MAX_DISCOUNT_PERCENT
  );
  return {
    ...DEFAULT_EVENT_FEATURES,
    ...stored,
    maxDiscountPercent,
  };
}

/**
 * Something an item still lacks before it may be announced for an event: a photo or
 * a required category field, written as `field:<key>`.
 */
export type MissingProductInfo = 'photo' | `field:${string}`;

/** The key of a missing category field, undefined for a missing photo. */
export function missingFieldKey(info: MissingProductInfo): string | undefined {
  return info.startsWith('field:') ? info.slice('field:'.length) : undefined;
}

/** German name of what is missing, e.g. for the error message of the backend. */
export function missingInfoLabel(info: MissingProductInfo, fields: CategoryField[]): string {
  const key = missingFieldKey(info);
  if (!key) return 'Foto';
  return fields.find((field) => field.key === key)?.label ?? key;
}

/**
 * What the item still needs for this event, empty when it is ready. Products may be
 * saved without a photo; only events that require photos ask for one. `fields` are the
 * fields of the item's category: a required field only applies where the category has it.
 */
export function missingForEvent(
  product: { images: readonly unknown[]; attributes?: Record<string, string> },
  event: { features?: StoredEventFeatures },
  fields: readonly CategoryField[] = []
): MissingProductInfo[] {
  const features = resolveEventFeatures(event);
  const missing: MissingProductInfo[] = [];
  if (product.images.length === 0 && !features.photosOptional) {
    missing.push('photo');
  }
  for (const key of features.requiredFields ?? []) {
    if (!fields.some((field) => field.key === key)) continue;
    if (!product.attributes?.[key]?.trim()) missing.push(`field:${key}`);
  }
  return missing;
}

/** Whether questions on items of this event can be asked right now. */
export function areQuestionsOpen(
  event: { startDate: number; endDate: number; features?: StoredEventFeatures },
  now: number
): boolean {
  const features = resolveEventFeatures(event);
  if (!features.questions) return false;
  return !features.questionsDuringEventOnly || (event.startDate <= now && now <= event.endDate);
}

/** Whether a seller may change discounts right now (event running and start time reached). */
export function getDiscountAvailability(
  event: { startDate: number; endDate: number; features?: StoredEventFeatures },
  now: number
): { allowed: true } | { allowed: false; reason: string; code: ErrorCode } {
  const features = resolveEventFeatures(event);
  if (!features.discounts) {
    return {
      allowed: false,
      reason: 'Bei dieser Veranstaltung sind keine Rabatte vorgesehen.',
      code: 'discount.none',
    };
  }
  if (now < event.startDate || now > event.endDate) {
    return {
      allowed: false,
      reason: 'Rabatte können nur während einer laufenden Veranstaltung angepasst werden',
      code: 'discount.notRunning',
    };
  }
  if (features.discountStartsAt !== undefined && now < features.discountStartsAt) {
    // No locale formatting here: the Convex runtime does not guarantee time zone data.
    return {
      allowed: false,
      reason: 'Rabatte sind erst ab der vom Veranstalter festgelegten Uhrzeit möglich.',
      code: 'discount.notYet',
    };
  }
  return { allowed: true };
}

/** Price after a seller discount; the list price at the cash desk without an offer. */
export function discountedPrice(price: number, discountPercent?: number): number {
  return discountPercent ? price * (1 - discountPercent / 100) : price;
}

/**
 * Online price offers only make sense for items that are actually at the bazaar:
 * handed in (status available) and while the event runs.
 */
export function areOffersOpen(
  listing: { status: string; startDate: number; endDate: number },
  now: number
): boolean {
  return listing.status === 'available' && listing.startDate <= now && now <= listing.endDate;
}

/** Whether labels of this event show the price: a discount would make a printed price wrong. */
export function showsPriceOnLabel(event: { features?: StoredEventFeatures }): boolean {
  const features = resolveEventFeatures(event);
  return features.priceOnLabel && !features.discounts;
}
