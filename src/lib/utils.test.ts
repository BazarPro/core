import { afterEach, describe, expect, test } from 'vitest';
import i18n from '../i18n';
import {
  capitalizeFirstLetter,
  cn,
  formatDateDE,
  formatDateDEShort,
  formatDateRangeDE,
  formatPriceDE,
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

  test('capitalizeFirstLetter and truncateText keep empty values', () => {
    expect(capitalizeFirstLetter('basar')).toBe('Basar');
    expect(capitalizeFirstLetter('')).toBe('');
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
    expect(formatPriceDE(12.5)).toBe('12,50');
    expect(formatPriceDE(3, 0)).toBe('3');
    expect(formatDateDE(day)).toBe('08. Februar 2026');
    expect(formatDateDEShort(day)).toBe('8.2.2026');
  });

  test('a range on one day shows the date once with the times', () => {
    const start = new Date(2026, 1, 8, 10, 0).getTime();
    const end = new Date(2026, 1, 8, 14, 30).getTime();
    expect(formatDateRangeDE(start, end)).toContain('08. Februar 2026, 10:00');
    expect(formatDateRangeDE(start, end)).toContain('14:30');
    const nextDay = new Date(2026, 1, 9, 12, 0).getTime();
    expect(formatDateRangeDE(start, nextDay)).toBe('08. Februar 2026 - 09. Februar 2026');
  });
});
