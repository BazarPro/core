import { afterEach, describe, expect, test } from 'vitest';
import i18n from '../i18n';
import {
  cn,
  formatDateDE,
  formatDateDEShort,
  formatDateRangeDE,
  formatPrice,
  getProductUrl,
  truncateText,
} from './utils';
import type { Id } from './api/types';

afterEach(async () => {
  await i18n.changeLanguage('de');
});

describe('utils', () => {
  test('cn merges Tailwind classes, the later one wins', () => {
    const hidden = false;
    expect(cn('p-2', hidden && 'hidden', 'p-4')).toBe('p-4');
  });

  test('truncateText keeps empty values', () => {
    expect(truncateText('')).toBe('');
    expect(truncateText('kurz')).toBe('kurz');
    expect(truncateText('Kinderwagen mit Babywanne', 11)).toBe('Kinderwagen..');
  });

  test('product URLs point to the public product page of this site', () => {
    expect(getProductUrl('p1' as Id<'products'>)).toBe(
      `${window.location.origin}/products/view/p1`
    );
  });

  test('prices and dates in German', () => {
    const day = new Date(2026, 1, 8, 10, 0).getTime();
    expect(formatPrice(12.5)).toBe('12,50');
    expect(formatPrice(3, 0)).toBe('3');
    expect(formatDateDE(day)).toBe('8. Februar 2026');
    expect(formatPrice(2349)).toBe('2.349,00');
    expect(formatDateDEShort(day)).toBe('8.2.2026');
  });

  test('prices with a decimal point in English', async () => {
    await i18n.changeLanguage('en');
    expect(formatPrice(405.4)).toBe('405.40');
    expect(formatPrice(1200, 0)).toBe('1,200');
  });

  test('a range on one day shows the date once with the times', () => {
    const start = new Date(2026, 1, 8, 10, 0).getTime();
    const end = new Date(2026, 1, 8, 14, 30).getTime();
    expect(formatDateRangeDE(start, end)).toContain('8. Februar 2026, 10:00');
    expect(formatDateRangeDE(start, end)).toContain('14:30');
    const nextDay = new Date(2026, 1, 9, 12, 0).getTime();
    expect(formatDateRangeDE(start, nextDay)).toBe('8.–9. Februar 2026');
    const nextMonth = new Date(2026, 2, 2, 12, 0).getTime();
    expect(formatDateRangeDE(start, nextMonth)).toBe('8. Februar – 2. März 2026');
  });
});
