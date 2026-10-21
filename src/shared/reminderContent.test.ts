import { describe, expect, test } from 'vitest';
import { mailT } from './i18n';
import { dayBeforeInfo, pickupReminder, type ReminderEvent } from './reminderContent';

const start = Date.UTC(2026, 9, 24, 8, 0);
const event: ReminderEvent = {
  _id: 'e1',
  title: 'Kinderbasar',
  location: 'Turnhalle',
  startDate: start,
  endDate: start + 6 * 3600_000,
  contactInfo: 'elternbeirat@example.org',
};
const withLogistics: ReminderEvent = {
  ...event,
  contactInfo: '  ',
  sellerLogistics: {
    dropoffStart: start - 16 * 3600_000,
    dropoffEnd: start - 13 * 3600_000,
    pickupStart: start + 7 * 3600_000,
    pickupEnd: start + 8 * 3600_000,
    note: 'Bitte Etiketten sichtbar anbringen.\n\nParkplatz hinter der Halle.',
  },
};

describe('reminder texts', () => {
  test('the evening before: items, seller number, drop-off and note', () => {
    const t = mailT('de');
    const plain = dayBeforeInfo(event, { itemCount: 3 }, t);
    expect(plain.subject).toContain('Kinderbasar');
    expect(plain.details?.map((d) => d.label)).not.toContain(t('reminder.dropoff'));
    expect(plain.paragraphs.at(-1)).toContain('elternbeirat@example.org');

    const full = dayBeforeInfo(withLogistics, { itemCount: 1, sellerNumber: 7 }, t);
    expect(full.details?.find((d) => d.label === t('reminder.yourNumber'))?.value).toBe('7');
    expect(full.details?.map((d) => d.label)).toContain(t('reminder.dropoff'));
    expect(full.paragraphs).toContain('Parkplatz hinter der Halle.');
    expect(full.paragraphs.join(' ')).not.toContain('elternbeirat');
  });

  test('after the bazaar: payout or fee due, unsold items, pick-up time', () => {
    const t = mailT('en');
    const titles = Array.from({ length: 12 }, (_, i) => `Item ${i + 1}`);
    const owed = pickupReminder(
      withLogistics,
      { soldCount: 4, payout: 37.5, unsoldTitles: titles },
      t
    );
    expect(owed.details?.find((d) => d.label === t('reminder.pickup.payout'))?.value).toBe(
      '37,50 €'
    );
    expect(owed.paragraphs.join(' ')).toContain('Item 10');
    expect(owed.paragraphs.join(' ')).not.toContain('Item 11');

    const due = pickupReminder(event, { soldCount: 0, payout: -2, unsoldTitles: [] }, t);
    expect(due.details?.find((d) => d.label === t('reminder.pickup.feeDue'))?.value).toBe('2,00 €');
    expect(due.paragraphs).toContain(t('reminder.pickup.where', { location: 'Turnhalle' }));
  });
});
