import type { NotificationContent } from './notifications';
import { formatBerlinRange } from './berlinTime';

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

function contactParagraph(event: ReminderEvent): string[] {
  const contact = event.contactInfo.trim();
  return contact ? [`Fragen? Der Veranstalter ist erreichbar unter: ${contact}`] : [];
}

function range(start?: number, end?: number): string | undefined {
  return start === undefined ? undefined : formatBerlinRange(start, end);
}

/** Info mail on the evening before the bazaar (#59). */
export function dayBeforeInfo(
  event: ReminderEvent,
  seller: { itemCount: number; sellerNumber?: number }
): NotificationContent {
  const logistics = event.sellerLogistics ?? {};
  const dropoff = range(logistics.dropoffStart, logistics.dropoffEnd);
  const details = [
    { label: 'Basar', value: formatBerlinRange(event.startDate, event.endDate) },
    { label: 'Ort', value: event.location },
    ...(dropoff ? [{ label: 'Abgabe', value: dropoff }] : []),
    ...(seller.sellerNumber !== undefined
      ? [{ label: 'Deine Nummer', value: String(seller.sellerNumber) }]
      : []),
    { label: 'Deine Artikel', value: String(seller.itemCount) },
  ];
  return {
    subject: `Bald ist es so weit: ${event.title}`,
    heading: `Alles Wichtige für „${event.title}“`,
    paragraphs: [
      `Du hast ${seller.itemCount} Artikel angemeldet. Drucke die Etiketten vorher aus (Meine Produkte → Etiketten als PDF) und befestige sie an den Teilen.`,
      ...(dropoff ? [`Bring deine Artikel zur Abgabe: ${dropoff}.`] : []),
      'Zeig bei der Abgabe deinen digitalen Ausweis aus deinem Konto, dann geht es schneller.',
      ...noteParagraphs(event),
      ...contactParagraph(event),
    ],
    details,
    link: { label: 'Meine Produkte', path: '/my-products' },
    category: 'reminders',
  };
}

/** Reminder after the bazaar to pick up unsold items and the money (#58). */
export function pickupReminder(
  event: ReminderEvent,
  seller: { soldCount: number; payout: number; unsoldTitles: string[] }
): NotificationContent {
  const logistics = event.sellerLogistics ?? {};
  const pickup = range(logistics.pickupStart, logistics.pickupEnd);
  const unsold = seller.unsoldTitles;
  const listed = unsold.slice(0, MAX_LISTED_ITEMS).join(', ');
  const more =
    unsold.length > MAX_LISTED_ITEMS ? ` und ${unsold.length - MAX_LISTED_ITEMS} weitere` : '';
  const euro = `${Math.abs(seller.payout).toFixed(2).replace('.', ',')} €`;
  return {
    subject: `Abholung: ${event.title}`,
    heading: 'Hol deine Artikel und dein Geld ab',
    paragraphs: [
      `„${event.title}“ ist vorbei. Du hast ${seller.soldCount} Artikel verkauft.`,
      ...(unsold.length > 0 ? [`Abzuholen: ${listed}${more}.`] : []),
      ...(pickup ? [`Abholung: ${pickup}, ${event.location}.`] : [`Ort: ${event.location}.`]),
      ...noteParagraphs(event),
      ...contactParagraph(event),
    ],
    details: [
      { label: 'Verkauft', value: `${seller.soldCount} Artikel` },
      seller.payout < 0
        ? { label: 'Annahmegebühr zu zahlen', value: euro }
        : { label: 'Auszahlung', value: euro },
      { label: 'Abzuholen', value: `${unsold.length} Artikel` },
    ],
    link: { label: 'Meine Verkäufe', path: '/my-sales' },
    category: 'reminders',
  };
}
