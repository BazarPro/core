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
