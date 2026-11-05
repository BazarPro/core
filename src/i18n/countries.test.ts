import { describe, expect, it } from 'vitest';
import { isPostalCodeValid } from '../shared/constants';
import { countryName } from './countries';

describe('countries', () => {
  it('names known codes and leaves the free text of older profiles', () => {
    expect(countryName('AT')).toBe('Österreich');
    expect(countryName('United Kingdom')).toBe('United Kingdom');
  });

  it('checks postal codes by country', () => {
    expect(isPostalCodeValid('89073', 'DE')).toBe(true);
    expect(isPostalCodeValid('6900', 'DE')).toBe(false);
    expect(isPostalCodeValid('6900', 'AT')).toBe(true);
    expect(isPostalCodeValid('89073', 'AT')).toBe(false);
    // No country counts as Germany, free text has no known format
    expect(isPostalCodeValid('6900', '')).toBe(false);
    expect(isPostalCodeValid('OX1 2JD', 'United Kingdom')).toBe(true);
  });
});
