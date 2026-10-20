import type { NotificationContent } from './notifications';
import { formatBerlinRange } from './berlinTime';
import type { MailT } from './i18n';
import { resolveEventFeatures, type StoredEventFeatures } from './eventFeatures';

/**
 * Texts of the seller reminders. Pure, so the event form shows the organizer
 * a preview of exactly this mail.
 */

export interface ReminderEvent {
  _id: string;
  title: string;
  location: string;
  startDate: number;
  endDate: number;
  contactInfo: string;
  features?: StoredEventFeatures;
  sellerLogistics?: {
    dropoffStart?: number;
    dropoffEnd?: number;
    pickupStart?: number;
    pickupEnd?: number;
    note?: string;
  };
}

const MAX_LISTED_ITEMS = 10;

function noteParagraphs(event: ReminderEvent): string[] {
  const note = event.sellerLogistics?.note?.trim();
  return note ? note.split(/\n\s*\n/).map((paragraph) => paragraph.trim()) : [];
}

function contactParagraph(event: ReminderEvent, t: MailT): string[] {
  const contact = event.contactInfo.trim();
  return contact ? [t('reminder.contact', { contact })] : [];
}

function range(t: MailT, start?: number, end?: number): string | undefined {
  return start === undefined ? undefined : formatBerlinRange(start, end, t.locale);
}

/** Info mail on the evening before the bazaar (#59). */
export function dayBeforeInfo(
  event: ReminderEvent,
  seller: { itemCount: number; sellerNumber?: number },
  t: MailT
): NotificationContent {
  const logistics = event.sellerLogistics ?? {};
  const dropoff = range(t, logistics.dropoffStart, logistics.dropoffEnd);
  const details = [
    {
      label: t('reminder.bazaar'),
      value: formatBerlinRange(event.startDate, event.endDate, t.locale),
    },
    { label: t('reminder.location'), value: event.location },
    ...(dropoff ? [{ label: t('reminder.dropoff'), value: dropoff }] : []),
    ...(seller.sellerNumber !== undefined
      ? [{ label: t('reminder.yourNumber'), value: String(seller.sellerNumber) }]
      : []),
    { label: t('reminder.yourItems'), value: String(seller.itemCount) },
  ];
  return {
    subject: t('reminder.dayBefore.subject', { event: event.title }),
    heading: t('reminder.dayBefore.heading', { event: event.title }),
    paragraphs: [
      t('reminder.dayBefore.items', { count: seller.itemCount }),
      ...(dropoff ? [t('reminder.dayBefore.dropoff', { dropoff })] : []),
      t('reminder.dayBefore.digitalId'),
      ...(resolveEventFeatures(event).sellerCollects
        ? [t('reminder.dayBefore.sellerCollects')]
        : []),
      ...noteParagraphs(event),
      ...contactParagraph(event, t),
    ],
    details,
    link: { label: t('reminder.dayBefore.link'), path: '/my-products' },
    category: 'reminders',
  };
}

/** Reminder after the bazaar to pick up unsold items and the money (#58). */
export function pickupReminder(
  event: ReminderEvent,
  seller: { soldCount: number; payout: number; unsoldTitles: string[] },
  t: MailT
): NotificationContent {
  const logistics = event.sellerLogistics ?? {};
  const pickup = range(t, logistics.pickupStart, logistics.pickupEnd);
  const unsold = seller.unsoldTitles;
  const listed = unsold.slice(0, MAX_LISTED_ITEMS).join(', ');
  const more =
    unsold.length > MAX_LISTED_ITEMS
      ? t('reminder.pickup.more', { count: unsold.length - MAX_LISTED_ITEMS })
      : '';
  const euro = `${Math.abs(seller.payout).toFixed(2).replace('.', ',')} €`;
  // Sellers who took the money themselves only owe the commission, nothing waits for them
  if (resolveEventFeatures(event).sellerCollects) {
    return {
      subject: t('reminder.commission.subject', { event: event.title }),
      heading: t('reminder.commission.heading'),
      paragraphs: [
        t('reminder.pickup.over', { event: event.title, count: seller.soldCount }),
        t('reminder.commission.text', { amount: euro }),
        ...noteParagraphs(event),
        ...contactParagraph(event, t),
      ],
      details: [
        { label: t('reminder.pickup.sold'), value: t('common.items', { count: seller.soldCount }) },
        { label: t('reminder.pickup.commissionDue'), value: euro },
      ],
      link: { label: t('reminder.pickup.link'), path: '/my-sales' },
      category: 'reminders',
    };
  }
  return {
    subject: t('reminder.pickup.subject', { event: event.title }),
    heading: t('reminder.pickup.heading'),
    paragraphs: [
      t('reminder.pickup.over', { event: event.title, count: seller.soldCount }),
      ...(unsold.length > 0 ? [t('reminder.pickup.toPickUp', { items: listed + more })] : []),
      pickup
        ? t('reminder.pickup.when', { pickup, location: event.location })
        : t('reminder.pickup.where', { location: event.location }),
      ...noteParagraphs(event),
      ...contactParagraph(event, t),
    ],
    details: [
      { label: t('reminder.pickup.sold'), value: t('common.items', { count: seller.soldCount }) },
      seller.payout < 0
        ? {
            label: resolveEventFeatures(event).sellerCollects
              ? t('reminder.pickup.commissionDue')
              : t('reminder.pickup.feeDue'),
            value: euro,
          }
        : { label: t('reminder.pickup.payout'), value: euro },
      {
        label: t('reminder.pickup.unsold'),
        value: t('common.items', { count: unsold.length }),
      },
    ],
    link: { label: t('reminder.pickup.link'), path: '/my-sales' },
    category: 'reminders',
  };
}
