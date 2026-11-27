import { describe, expect, it } from 'vitest';
import { EVENT_TYPES, findEventType, preselectedCategories } from './eventTypes';
import { resolveEventFeatures, showsPriceOnLabel } from '../shared/eventFeatures';
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
      // Fields of the default categories (migration 0034)
      for (const key of type.features.requiredFields ?? []) {
        expect([
          'frameNumber',
          'frameSize',
          'wheelSize',
          'brand',
          'color',
          'size',
          'model',
        ]).toContain(key);
      }
      // The template's choice is what the labels show, discounts or not (#327)
      if (type.features.priceOnLabel) expect(showsPriceOnLabel(type)).toBe(true);
    }
  });

  it('uses universal labels at every kind of bazaar', () => {
    const marks = Object.fromEntries(
      EVENT_TYPES.map((type) => [type.id, resolveEventFeatures(type).labelMark])
    );
    expect(marks).toEqual({
      kidsBazaar: 'universal',
      clothingBazaar: 'universal',
      skiBazaar: 'universal',
      bikeExchange: 'universal',
    });
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
    // Children's vehicles at both, cargo bikes, trailers and accessories only at the bike sale
    for (const label of [
      'Kinderfahrräder',
      'Laufräder',
      'Roller & Scooter',
      'Einräder',
      'Bobbycars & Rutschfahrzeuge',
      'Kinderfahrzeuge',
    ]) {
      expect(match('kidsBazaar', label), label).toBe(true);
      expect(match('bikeExchange', label), label).toBe(true);
    }
    for (const label of [
      'Lastenräder',
      'E-Bikes & Pedelecs',
      'Fahrradanhänger',
      'Fahrradzubehör',
    ]) {
      expect(match('bikeExchange', label), label).toBe(true);
      expect(match('kidsBazaar', label), label).toBe(false);
    }
    expect(match('bikeExchange', 'Einrichtung')).toBe(false);
  });

  it('a main category brings its sub-categories, unless the kind excludes them', () => {
    const tree = [
      { _id: 'clothes', label: 'Kleidung' },
      { _id: 'kidsClothes', label: 'Kinderkleidung', parentCategory: 'clothes' },
      { _id: 'women', label: 'Damenkleidung', parentCategory: 'clothes' },
      { _id: 'maternity', label: 'Umstandsmode', parentCategory: 'clothes' },
      { _id: 'books', label: 'Bücher' },
      { _id: 'novels', label: 'Romane', parentCategory: 'books' },
      { _id: 'kidsBooks', label: 'Kinderbücher', parentCategory: 'books' },
      { _id: 'bikes', label: 'Fahrräder' },
      { _id: 'cargo', label: 'Lastenräder', parentCategory: 'bikes' },
      { _id: 'vehicles', label: 'Kinderfahrzeuge' },
      { _id: 'scooters', label: 'Roller & Scooter', parentCategory: 'vehicles' },
      { _id: 'prams', label: 'Kinderwagen & Buggys', parentCategory: 'vehicles' },
      { _id: 'electronics', label: 'Elektronik' },
      { _id: 'games', label: 'Konsolen & Videospiele', parentCategory: 'electronics' },
    ];
    const chosen = (id: string) => preselectedCategories(findEventType(id)!, tree);
    // Stored as a bazaar does: the sub-categories, a main category when all are in
    expect(chosen('kidsBazaar')).toEqual(['kidsClothes', 'maternity', 'kidsBooks', 'vehicles']);
    expect(chosen('bikeExchange')).toEqual(['bikes', 'scooters']);
  });

  it('the bike sale follows the guide: frame number required and an intake fee', () => {
    const bikes = findEventType('bikeExchange')!;
    expect(bikes.features.requiredFields).toEqual(['frameNumber']);
    expect(bikes.features.intakeFee).toBe(3);
    expect(bikes.features.photosOptional).toBe(false);
    expect(bikes.features.priceOffers && bikes.features.minimumPrice).toBe(true);
  });

  it('drafts may name a kind that no longer exists', () => {
    expect(findEventType('bikeMarketRecord')).toBeUndefined();
    expect(findEventType('skiBazaar')?.item).toBe('ski');
  });
});
