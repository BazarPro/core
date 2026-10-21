import type { Locale } from './constants';

/**
 * Dates and times on Berlin time, in German or English. The Convex runtime does not
 * guarantee time zone data, so the offset (CET/CEST) is computed here. Pure, so
 * the frontend uses the same texts (e.g. for the mail preview).
 */

const HOUR = 60 * 60 * 1000;
const WEEKDAYS_DE = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
];
const MONTHS_DE = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** 01:00 UTC on the last Sunday of the month: when summer time starts or ends in the EU. */
function lastSundayOneAm(year: number, month: number): number {
  const lastDay = new Date(Date.UTC(year, month + 1, 0));
  return Date.UTC(year, month, lastDay.getUTCDate() - lastDay.getUTCDay(), 1);
}

/** Hours Berlin is ahead of UTC at this moment: 2 in summer, 1 in winter. */
export function berlinOffsetHours(timestamp: number): number {
  const year = new Date(timestamp).getUTCFullYear();
  const summer = timestamp >= lastSundayOneAm(year, 2) && timestamp < lastSundayOneAm(year, 9);
  return summer ? 2 : 1;
}

/** Wall clock in Berlin, read via the UTC getters. */
function berlinClock(timestamp: number): Date {
  return new Date(timestamp + berlinOffsetHours(timestamp) * HOUR);
}

/** "Samstag, 18. Oktober 2026" or "Saturday, 18 October 2026" */
export function formatBerlinDate(timestamp: number, locale: Locale = 'de'): string {
  const clock = berlinClock(timestamp);
  const day = clock.getUTCDate();
  const year = clock.getUTCFullYear();
  if (locale === 'en') {
    return `${WEEKDAYS_EN[clock.getUTCDay()]}, ${day} ${MONTHS_EN[clock.getUTCMonth()]} ${year}`;
  }
  return `${WEEKDAYS_DE[clock.getUTCDay()]}, ${day}. ${MONTHS_DE[clock.getUTCMonth()]} ${year}`;
}

/** "9:00" */
export function formatBerlinTime(timestamp: number): string {
  const clock = berlinClock(timestamp);
  return `${clock.getUTCHours()}:${String(clock.getUTCMinutes()).padStart(2, '0')}`;
}

/** "Samstag, 18. Oktober 2026, 9:00–11:00 Uhr", or both dates when they differ. */
export function formatBerlinRange(start: number, end?: number, locale: Locale = 'de'): string {
  const date = (timestamp: number) => formatBerlinDate(timestamp, locale);
  const time = formatBerlinTime;
  const oclock = locale === 'en' ? '' : ' Uhr';
  if (end === undefined) return `${date(start)}, ${time(start)}${oclock}`;
  if (date(start) === date(end)) {
    return `${date(start)}, ${time(start)}–${time(end)}${oclock}`;
  }
  const until = locale === 'en' ? 'until' : 'bis';
  return `${date(start)}, ${time(start)}${oclock} ${until} ${date(end)}, ${time(end)}${oclock}`;
}

/** Midnight in Berlin at the start of the day of `timestamp`. */
export function berlinStartOfDay(timestamp: number): number {
  const clock = berlinClock(timestamp);
  const guess =
    Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth(), clock.getUTCDate()) -
    berlinOffsetHours(timestamp) * HOUR;
  // On the days the clocks change, midnight has the other offset
  return (
    Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth(), clock.getUTCDate()) -
    berlinOffsetHours(guess) * HOUR
  );
}

/** 18:00 in Berlin on the day before `timestamp`: when the info mail for sellers goes out. */
export function eveningBefore(timestamp: number): number {
  return berlinStartOfDay(timestamp) - 6 * HOUR;
}
