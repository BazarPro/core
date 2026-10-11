import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDiscountButtonState } from './discountRules';
import {
  isMinimumPriceBelowPrice,
  productExtrasDefaults,
  productExtrasPayload,
} from './productExtras';

describe('getDiscountButtonState', () => {
  afterEach(() => vi.useRealTimers());

  it('shows a normal button without rules or when allowed', () => {
    expect(getDiscountButtonState(undefined)).toEqual({
      visible: true,
      disabled: false,
      label: 'Rabatt',
    });
    expect(getDiscountButtonState({ allowed: true, maxDiscountPercent: 30 }).disabled).toBe(false);
  });

  it('shows the start time while discounts are not open yet', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 11, 14, 0));
    const state = getDiscountButtonState({
      allowed: false,
      maxDiscountPercent: 30,
      discountStartsAt: new Date(2026, 9, 11, 15, 0).getTime(),
    });
    expect(state).toEqual({ visible: true, disabled: true, label: 'Rabatt ab 15:00 Uhr' });
  });

  it('hides the button when the organizer switched discounts off', () => {
    expect(getDiscountButtonState({ allowed: false, maxDiscountPercent: 50 }).visible).toBe(false);
  });
});

describe('product extras form helpers', () => {
  it('minimum price must be below the price, empty is fine', () => {
    expect(isMinimumPriceBelowPrice({ price: 100 })).toBe(true);
    expect(isMinimumPriceBelowPrice({ price: 100, minimumPrice: NaN })).toBe(true);
    expect(isMinimumPriceBelowPrice({ price: 100, minimumPrice: 80 })).toBe(true);
    expect(isMinimumPriceBelowPrice({ price: 100, minimumPrice: 100 })).toBe(false);
  });

  it('payload drops an empty minimum price', () => {
    expect(productExtrasPayload({ acceptsOffers: true, minimumPrice: NaN })).toEqual({
      attributes: undefined,
      acceptsOffers: true,
      minimumPrice: undefined,
    });
    expect(
      productExtrasPayload({ acceptsOffers: false, minimumPrice: 50, attributes: { a: 'b' } })
    ).toEqual({ attributes: { a: 'b' }, acceptsOffers: false, minimumPrice: 50 });
  });

  it('defaults come from the product or are empty', () => {
    expect(productExtrasDefaults()).toEqual({
      attributes: {},
      acceptsOffers: false,
      minimumPrice: undefined,
    });
    expect(productExtrasDefaults({ acceptsOffers: true, minimumPrice: 20 })).toMatchObject({
      acceptsOffers: true,
      minimumPrice: 20,
    });
  });
});
