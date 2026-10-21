import { describe, expect, test } from 'vitest';
import {
  describeAttributes,
  getCategoryFields,
  getFieldsForLabel,
  sanitizeAttributes,
} from './categoryFields';
import {
  DEFAULT_EVENT_FEATURES,
  getDiscountAvailability,
  resolveEventFeatures,
} from './eventFeatures';

const keys = (label: string) => getFieldsForLabel(label)?.map((field) => field.key);
const BIKE_KEYS = ['frameNumber', 'frameSize', 'wheelSize', 'brand'];

describe('category fields by keyword', () => {
  test.each([
    'Fahrräder',
    'Fahrrad',
    'Cityräder & Hollandräder',
    'Kinder- & Jugendräder',
    'Falträder & Klappräder',
    'E-Bikes / Pedelecs',
    'Mountainbikes (MTB)',
    'Trekkingräder',
    'Rennräder & Gravelbikes',
    'BMX & Dirtbikes',
    'Einrad',
    'Laufrad',
  ])('"%s" gets the bike fields', (label) => {
    expect(keys(label)).toEqual(BIKE_KEYS);
  });

  test.each(['Radio & HiFi', 'Fahrradzubehör', 'Fahrradteile', 'Fahrradhelme', 'Sonstiges'])(
    '"%s" gets no bike fields',
    (label) => {
      expect(keys(label)).not.toEqual(BIKE_KEYS);
    }
  );

  test('cycling clothes count as clothing, sports shoes as shoes', () => {
    expect(keys('Fahrradbekleidung')).toEqual(['size', 'brand']);
    expect(getFieldsForLabel('Sportschuhe')?.[0].label).toBe('Größe (EU)');
    expect(getFieldsForLabel('Kleidung')?.[0].label).toBe('Größe');
    expect(getFieldsForLabel('Damenmode')?.[0].label).toBe('Größe');
    expect(getFieldsForLabel('Sondermodelle')).toBeUndefined();
    expect(getFieldsForLabel('Wintersport')?.[0].label).toBe('Größe / Länge');
    expect(keys('Elektronik')).toEqual(['brand', 'model']);
  });

  test('categories without a rule have no fields', () => {
    expect(getFieldsForLabel('Bücher')).toBeUndefined();
    expect(getFieldsForLabel('Sonstiges')).toBeUndefined();
  });

  test('sub-categories inherit the fields of their parent', () => {
    const categories = [
      { _id: 'bikes', label: 'Räder' },
      { _id: 'special', label: 'Sondermodelle', parentCategory: 'bikes' },
      { _id: 'loop', label: 'Loop', parentCategory: 'loop' },
    ];
    expect(getCategoryFields('special', categories).map((f) => f.key)).toEqual(BIKE_KEYS);
    expect(getCategoryFields('loop', categories)).toEqual([]);
    expect(getCategoryFields(undefined, categories)).toEqual([]);
    expect(getCategoryFields('bikes', undefined)).toEqual([]);
  });

  test('sanitize keeps known, non-empty, trimmed and shortened values', () => {
    const fields = getFieldsForLabel('Trekkingräder')!;
    expect(
      sanitizeAttributes(fields, {
        frameNumber: '  WBK 1  ',
        brand: '',
        colour: 'rot',
        frameSize: 'x'.repeat(200),
      })
    ).toEqual({ frameNumber: 'WBK 1', frameSize: 'x'.repeat(120) });
    expect(sanitizeAttributes(fields, { brand: '   ' })).toBeUndefined();
    expect(sanitizeAttributes(fields, undefined)).toBeUndefined();
  });

  test('describe lists values in category order with labels', () => {
    const fields = getFieldsForLabel('Trekkingräder')!;
    expect(describeAttributes(fields, { brand: 'Cube', frameNumber: 'WBK 1' })).toEqual([
      { label: 'Rahmennummer', text: 'frameNumber', value: 'WBK 1' },
      { label: 'Marke', text: 'bikeBrand', value: 'Cube' },
    ]);
    expect(describeAttributes(fields, undefined)).toEqual([]);
  });
});

describe('event feature helpers', () => {
  const HOUR = 60 * 60 * 1000;
  const now = 1_800_000_000_000;
  const running = { startDate: now - HOUR, endDate: now + HOUR };

  test('missing features fall back to the old behaviour', () => {
    expect(resolveEventFeatures({})).toEqual(DEFAULT_EVENT_FEATURES);
  });

  test('maximum discount is clamped to 1–50 and rounded', () => {
    expect(resolveEventFeatures({ features: { maxDiscountPercent: 80 } }).maxDiscountPercent).toBe(
      50
    );
    expect(resolveEventFeatures({ features: { maxDiscountPercent: 0 } }).maxDiscountPercent).toBe(
      1
    );
    expect(
      resolveEventFeatures({ features: { maxDiscountPercent: 22.6 } }).maxDiscountPercent
    ).toBe(23);
  });

  test('discounts: switched off, outside the event, before start time, allowed', () => {
    expect(getDiscountAvailability({ ...running, features: { discounts: false } }, now)).toEqual({
      allowed: false,
      reason: expect.stringContaining('keine Rabatte'),
      code: 'discount.none',
    });
    expect(getDiscountAvailability(running, now + 2 * HOUR).allowed).toBe(false);
    expect(getDiscountAvailability(running, now - 2 * HOUR).allowed).toBe(false);
    expect(
      getDiscountAvailability({ ...running, features: { discountStartsAt: now + 1 } }, now)
    ).toEqual({
      allowed: false,
      reason: expect.stringContaining('Uhrzeit'),
      code: 'discount.notYet',
    });
    expect(
      getDiscountAvailability({ ...running, features: { discountStartsAt: now } }, now)
    ).toEqual({ allowed: true });
  });
});
