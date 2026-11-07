import { describe, expect, it } from 'vitest';
import { parsePriceInput, pickQuickAddEvent, quickAddBlocker, quickSizeField } from './quickAdd';

const categories = [
  { _id: 'clothes', label: 'Kleidung' },
  { _id: 'bikes', label: 'Fahrräder' },
  { _id: 'toys', label: 'Spielzeug' },
];

describe('parsePriceInput', () => {
  it('reads prices as people type them', () => {
    expect(parsePriceInput('2,50')).toBe(2.5);
    expect(parsePriceInput('2.5')).toBe(2.5);
    expect(parsePriceInput(' 3 € ')).toBe(3);
    expect(parsePriceInput('1.200')).toBe(1200);
    expect(parsePriceInput('0')).toBe(0);
  });

  it('refuses what is no price', () => {
    expect(parsePriceInput('')).toBeNull();
    expect(parsePriceInput('-2')).toBeNull();
    expect(parsePriceInput('2,555')).toBeNull();
    expect(parsePriceInput('abc')).toBeNull();
    // Cents only up to 999,99 €, whole euros up to 9999 €
    expect(parsePriceInput('1500,50')).toBeNull();
    expect(parsePriceInput('10000')).toBeNull();
  });
});

describe('pickQuickAddEvent', () => {
  const upcoming = [{ _id: 'a' }, { _id: 'b' }];
  it('prefers the filter, then the remembered bazaar, then the only one', () => {
    expect(pickQuickAddEvent(upcoming, 'b', 'a')).toBe('b');
    expect(pickQuickAddEvent(upcoming, undefined, 'a')).toBe('a');
    expect(pickQuickAddEvent(upcoming, undefined, '')).toBe('');
    expect(pickQuickAddEvent(upcoming, undefined, 'gone')).toBe('');
    expect(pickQuickAddEvent([{ _id: 'a' }], undefined, undefined)).toBe('a');
  });
});

describe('quickAddBlocker', () => {
  it('asks for a photo where the bazaar requires one', () => {
    const event = { features: { photosOptional: false } };
    expect(quickAddBlocker(event, 'toys', categories, false)).toEqual({ kind: 'photo' });
    expect(quickAddBlocker(event, 'toys', categories, true)).toBeNull();
    expect(quickAddBlocker(undefined, 'toys', categories, false)).toBeNull();
  });

  it('sends fields the quick entry does not ask for to the full form', () => {
    const event = { features: { photosOptional: true, requiredFields: ['frameNumber', 'size'] } };
    expect(quickAddBlocker(event, 'bikes', categories, false)).toMatchObject({
      kind: 'field',
      field: { key: 'frameNumber' },
    });
    // The size is asked for right in the quick entry
    expect(quickAddBlocker(event, 'clothes', categories, false, ['size'])).toBeNull();
    expect(quickAddBlocker(event, 'toys', categories, false)).toBeNull();
  });
});

describe('quickSizeField', () => {
  it('finds the size of clothes, not of toys', () => {
    expect(quickSizeField('clothes', categories)?.key).toBe('size');
    expect(quickSizeField('toys', categories)).toBeUndefined();
  });
});
