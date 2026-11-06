import { describe, expect, it } from 'vitest';
import { isPriceInRange } from './constants';

describe('isPriceInRange', () => {
  it('allows cents up to 999,99 € and whole euros up to 9999 €', () => {
    expect(isPriceInRange(999.99)).toBe(true);
    expect(isPriceInRange(1000.5)).toBe(false);
    expect(isPriceInRange(1200)).toBe(true);
    expect(isPriceInRange(9999)).toBe(true);
    expect(isPriceInRange(10000)).toBe(false);
  });
});
