import { describe, expect, it } from 'vitest';
import { autoViewMode, formatItemPrice, initialOf, tintIndex } from './productDisplay';

describe('productDisplay', () => {
  it('takes the first letter of a title', () => {
    expect(initialOf('body Gr. 68')).toBe('B');
    expect(initialOf('„Die Raupe“')).toBe('D');
    expect(initialOf('123')).toBe('1');
  });

  it('gives a title always the same colour', () => {
    expect(tintIndex('Body', 8)).toBe(tintIndex('Body', 8));
    expect(tintIndex('Body', 8)).toBeLessThan(8);
  });

  it('writes whole prices above 999 € without cents', () => {
    expect(formatItemPrice(8)).toBe('8,00 €');
    expect(formatItemPrice(1500)).toBe('1500 €');
  });

  it('shows a list when most items have no photo', () => {
    const photo = { images: ['x'] };
    const none = { images: [] };
    expect(autoViewMode([])).toBe('grid');
    expect(autoViewMode([photo, none])).toBe('grid');
    expect(autoViewMode([photo, none, none])).toBe('list');
  });
});
