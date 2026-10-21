import { describe, expect, it } from 'vitest';
import { EVENT_TYPES } from './eventTypes';
import { resolveEventFeatures, showsPriceOnLabel } from '../shared/eventFeatures';
import { REQUIRABLE_FIELD_KEYS } from '../shared/categoryFields';
import i18n from '../i18n';

describe('event types', () => {
  it('each has texts in every language and valid settings', () => {
    for (const type of EVENT_TYPES) {
      for (const lng of ['de', 'en']) {
        for (const part of ['title', 'text']) {
          const key = `eventTypes.${type.id}.${part}`;
          expect(i18n.exists(key, { ns: 'organizer', lng }), `${lng} ${key}`).toBe(true);
        }
      }
      for (const key of type.features.requiredFields ?? []) {
        expect(REQUIRABLE_FIELD_KEYS).toContain(key);
      }
      // A printed price only works without discounts
      if (type.features.priceOnLabel) expect(showsPriceOnLabel(type)).toBe(true);
    }
  });

  it('the bike market of the KV Ulm: record with fixed data and frame number', () => {
    const market = EVENT_TYPES.find((type) => type.id === 'bikeMarketRecord')!;
    expect(market.commission).toBe(20);
    expect(resolveEventFeatures(market)).toMatchObject({
      fixedSellerData: true,
      privateSellersOnly: true,
      maxItemsPerSeller: 5,
      requiredFields: ['frameNumber'],
      questionsDuringEventOnly: true,
    });
    expect(market.categoryMatch?.test('Fahrräder')).toBe(true);
    expect(market.categoryMatch?.test('Radios')).toBe(false);
  });
});
