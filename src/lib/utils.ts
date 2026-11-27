import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Id } from './api/types';
import i18n from '../i18n';
import { dateLocale } from '../i18n/format';
import { getSiteUrl } from './seo';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generiert die öffentliche URL für ein Produkt
 * @param productId - Die ID des Produkts
 * @returns Die vollständige URL zum Produkt
 */
export function getProductUrl(productId: Id<'products'>): string {
  // The site, not the page origin: in the mobile app that is capacitor://localhost
  return `${getSiteUrl()}/products/view/${productId}`;
}

/**
 * Kürzt einen Text auf die angegebene Länge und fügt ".." hinzu, wenn er abgeschnitten wurde
 * @param text - Der zu kürzende Text
 * @param maxLength - Die maximale Länge (Standard: 20)
 * @returns Der gekürzte Text mit ".." am Ende, falls nötig
 */
export function truncateText(text: string, maxLength: number = 20): string {
  if (!text) return text;
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '..';
}

/**
 * An amount in the format of the app's language, without the currency and with thousands
 * grouped: "2.349,50" in German, "2,349.50" in English. The euro sign follows in the texts
 * ("12,34 €", "12.34 €"), the same in both languages.
 */
export function formatPrice(price: number, decimals: number = 2): string {
  return new Intl.NumberFormat(dateLocale().startsWith('de') ? 'de-DE' : 'en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(price);
}

/** A date in long form, without a leading zero: "8. Februar 2025" */
export function formatDateDE(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(dateLocale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Date and time, e.g. "08.02.2025, 14:30" */
export function formatDateTimeDE(timestamp: number): string {
  return new Date(timestamp).toLocaleString(dateLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * Formatiert einen Timestamp als deutsches Datum kurz (z.B. "08.02.2025")
 */
export function formatDateDEShort(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(dateLocale());
}

/**
 * A period in the app's language. On one day the date once with the times
 * ("6. Dezember 2026, 09:00 – 14:00 Uhr"), over several days the dates with a dash.
 *
 * @param start - Start-Timestamp
 * @param end - End-Timestamp
 * @returns Formatierter Datumsbereich-String
 */
export function formatDateRangeDE(start: number, end: number): string {
  const startDate = new Date(start);
  const endDate = new Date(end);

  const isSameDay =
    startDate.getDate() === endDate.getDate() &&
    startDate.getMonth() === endDate.getMonth() &&
    startDate.getFullYear() === endDate.getFullYear();

  if (isSameDay) {
    const date = startDate.toLocaleDateString(dateLocale(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const startTime = startDate.toLocaleTimeString(dateLocale(), {
      hour: '2-digit',
      minute: '2-digit',
    });
    const endTime = endDate.toLocaleTimeString(dateLocale(), {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${date}, ${i18n.t('time.range', { start: startTime, end: endTime })}`;
  }

  // The year and month only once: "27.–28. November 2026", "30. November – 2. Dezember 2026"
  return (
    new Intl.DateTimeFormat(dateLocale(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
      .formatRange(startDate, endDate)
      // Thin spaces around the dash: plain ones, as in the other texts
      .replace(/\u2009/g, ' ')
  );
}
