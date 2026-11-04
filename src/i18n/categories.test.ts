import { afterEach, describe, expect, it } from 'vitest';
import i18n from '.';
import { categoryName, categoryNames } from './categories';

const bikes = { _id: 'b', label: 'Fahrräder', translations: { en: 'Bikes' } };
const misc = { _id: 'm', label: 'Sonstiges', translations: {} };

describe('category names', () => {
  afterEach(() => i18n.changeLanguage('de'));

  it('uses the translation of the current language, else the label', async () => {
    expect(categoryName(bikes)).toBe('Fahrräder');
    await i18n.changeLanguage('en');
    expect(categoryName(bikes)).toBe('Bikes');
    expect(categoryName(misc)).toBe('Sonstiges');
  });

  it('gives up when the list is not there or lacks a category', () => {
    expect(categoryNames(['b'], undefined)).toBeUndefined();
    expect(categoryNames(['gone'], [bikes])).toBeUndefined();
    expect(categoryNames(['m', 'b'], [bikes, misc])).toEqual(['Sonstiges', 'Fahrräder']);
  });
});
