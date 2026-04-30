import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Id } from '../../convex/_generated/dataModel';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function capitalizeFirstLetter(string: string) {
  if (!string) return string;
  return string.charAt(0).toUpperCase() + string.slice(1);
}

/**
 * Generiert die öffentliche URL für ein Produkt
 * @param productId - Die ID des Produkts
 * @returns Die vollständige URL zum Produkt
 */
export function getProductUrl(productId: Id<'products'>): string {
  const baseUrl = window.location.origin;
  return `${baseUrl}/products/view/${productId}`;
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
 * Formatiert eine Zahl als Preis im deutschen Format (Komma als Dezimaltrennzeichen)
 * @param price - Der Preis als Zahl
 * @param decimals - Anzahl der Dezimalstellen (Standard: 2)
 * @returns Formatierter Preis-String im deutschen Format (z.B. "12,34")
 */
export function formatPriceDE(price: number, decimals: number = 2): string {
  return price.toFixed(decimals).replace('.', ',');
}

/**
 * Formatiert einen Timestamp als deutsches Datum lang (z.B. "08. Februar 2025")
 */
export function formatDateDE(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Formatiert einen Timestamp als deutsches Datum kurz (z.B. "08.02.2025")
 */
export function formatDateDEShort(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('de-DE');
}

/**
 * Formatiert einen Zeitraum (Start- und Enddatum) im deutschen Format.
 * Wenn Start- und Enddatum am selben Tag liegen, wird das Datum nur einmal
 * mit der entsprechenden Uhrzeitspanne ausgegeben.
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
    const date = startDate.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    const startTime = startDate.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const endTime = endDate.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${date}, ${startTime} - ${endTime} Uhr`;
  }

  return `${formatDateDE(start)} - ${formatDateDE(end)}`;
}
