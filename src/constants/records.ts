import type {
  ProductContitions,
  EventProductStatus,
  EventVisibility,
} from '../../convex/constants';

import i18n from '../i18n';
import {
  EVENT_PRODUCT_STATUSES,
  EVENT_VISIBILITY,
  PRODUCT_CONDITIONS,
} from '../../convex/constants';

type Labels = { readonly title: string; readonly description: string };

/** Title and description in the current language, read when accessed (src/locales/<lang>/records.json). */
function labels<K extends string>(
  group: 'condition' | 'status' | 'visibility' | 'payout',
  keys: readonly K[]
): Record<K, Labels> {
  return Object.fromEntries(
    keys.map((key) => [
      key,
      {
        get title() {
          return i18n.t(`${group}.${key}.title` as never, { ns: 'records' }) as string;
        },
        get description() {
          return i18n.t(`${group}.${key}.description` as never, { ns: 'records' }) as string;
        },
      },
    ])
  ) as Record<K, Labels>;
}

export const CONDITION_OPTIONS: Record<ProductContitions, Labels> = labels(
  'condition',
  PRODUCT_CONDITIONS
);

export const STATUS_OPTIONS: Record<EventProductStatus, Labels> = labels(
  'status',
  EVENT_PRODUCT_STATUSES
);

export const VISIBILITY_OPTIONS: Record<EventVisibility, Labels> = labels(
  'visibility',
  EVENT_VISIBILITY
);

/**
 * Auszahlungsstatus für Verkäufer am Event (Convex: eventSeller.payoutReceived bzw.
 * getVendorsForEvent.paid). Kein Schema-Union wie bei Produktstatus — nur abgeleitet aus boolean.
 */
const PAYOUT_LABELS = labels('payout', ['paid', 'pending'] as const);
export const VENDOR_PAYOUT_STATUS_OPTIONS = {
  paid: Object.assign(Object.create(PAYOUT_LABELS.paid) as Labels, {
    badgeVariant: 'default' as const,
  }),
  pending: Object.assign(Object.create(PAYOUT_LABELS.pending) as Labels, {
    badgeVariant: 'outline' as const,
  }),
};

export function vendorPayoutStatusFromPaid(paid: boolean) {
  return paid ? VENDOR_PAYOUT_STATUS_OPTIONS.paid : VENDOR_PAYOUT_STATUS_OPTIONS.pending;
}
