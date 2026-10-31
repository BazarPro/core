import { describe, expect, it } from 'vitest';
import { EVENT_TYPES, findEventType } from './eventTypes';
import { showsPriceOnLabel } from '../shared/eventFeatures';
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

  it('the most asked for kinds come first, each with examples for the previews', () => {
    expect(EVENT_TYPES.map((type) => type.id)).toEqual([
      'kidsBazaar',
      'clothingBazaar',
      'skiBazaar',
      'bikeExchange',
    ]);
    for (const type of EVENT_TYPES) {
      for (const lng of ['de', 'en']) {
        const t = i18n.getFixedT(lng, 'organizer');
        const items = t(`eventTypes.${type.id}.exampleItems`, { returnObjects: true });
        const highlights = t(`eventTypes.${type.id}.highlights`, { returnObjects: true });
        expect(items, `${lng} ${type.id}`).toHaveLength(type.examplePrices.length);
        expect(highlights, `${lng} ${type.id}`).toHaveLength(3);
      }
    }
  });

  it('preselects the categories of each kind', () => {
    const match = (id: string, label: string) =>
      EVENT_TYPES.find((type) => type.id === id)!.categoryMatch!.test(label);
    expect(match('kidsBazaar', 'Spielzeug')).toBe(true);
    expect(match('skiBazaar', 'Sport')).toBe(true);
    expect(match('bikeExchange', 'Fahrräder')).toBe(true);
    expect(match('bikeExchange', 'Radios')).toBe(false);
  });

  it('drafts may name a kind that no longer exists', () => {
    expect(findEventType('bikeMarketRecord')).toBeUndefined();
    expect(findEventType('skiBazaar')?.item).toBe('ski');
  });
});
