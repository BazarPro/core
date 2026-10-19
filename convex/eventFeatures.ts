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
  /** Items without a photo are allowed, e.g. for a children's bazaar with many small items. */
  photosOptional: boolean;
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
  photosOptional: false,
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

/** Something an item still lacks before it may be announced for an event. */
export type MissingProductInfo = 'photo';

export const MISSING_PRODUCT_INFO_LABELS: Record<MissingProductInfo, string> = {
  photo: 'Foto',
};

/**
 * What the item still needs for this event, empty when it is ready. Products may be
 * saved without a photo; only events that require photos ask for one.
 */
export function missingForEvent(
  product: { images: readonly unknown[] },
  event: { features?: StoredEventFeatures }
): MissingProductInfo[] {
  const missing: MissingProductInfo[] = [];
  if (product.images.length === 0 && !resolveEventFeatures(event).photosOptional) {
    missing.push('photo');
  }
  return missing;
}

/** Whether a seller may change discounts right now (event running and start time reached). */
export function getDiscountAvailability(
  event: { startDate: number; endDate: number; features?: StoredEventFeatures },
  now: number
): { allowed: true } | { allowed: false; reason: string } {
  const features = resolveEventFeatures(event);
  if (!features.discounts) {
    return { allowed: false, reason: 'Bei dieser Veranstaltung sind keine Rabatte vorgesehen.' };
  }
  if (now < event.startDate || now > event.endDate) {
    return {
      allowed: false,
      reason: 'Rabatte können nur während einer laufenden Veranstaltung angepasst werden',
    };
  }
  if (features.discountStartsAt !== undefined && now < features.discountStartsAt) {
    // No locale formatting here: the Convex runtime does not guarantee time zone data.
    return {
      allowed: false,
      reason: 'Rabatte sind erst ab der vom Veranstalter festgelegten Uhrzeit möglich.',
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
