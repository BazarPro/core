import { describe, expect, it } from 'vitest';
import type { Doc, Id } from './api/types';
import {
  distanceKm,
  eventPosition,
  loadPlaces,
  locate,
  meetsCondition,
  searchBazaars,
  suggestPlaces,
  type Places,
} from './bazaarSearch';
import places from '../assets/postal-centroids.json';

const PLACES = places as unknown as Places;
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 25);

function bazaar(id: string, extra: Partial<Doc<'events'>> = {}): Doc<'events'> {
  return {
    _id: id,
    title: id,
    description: '',
    location: '',
    startDate: NOW + 5 * DAY,
    endDate: NOW + 5 * DAY + 6 * 3600_000,
    categories: [],
    services: [],
    commission: 10,
    contactInfo: '',
    visibility: 'public',
    organizerId: 'u1',
    _creationTime: 0,
    ...extra,
  } as Doc<'events'>;
}

const search = (events: Doc<'events'>[], query: string, extra: object = {}) =>
  searchBazaars(events, {
    places: PLACES,
    origin: query ? locate(PLACES, query) : undefined,
    radius: 25,
    filters: { when: 'upcoming', conditions: [], categories: [] },
    categories: [],
    now: NOW,
    ...extra,
  });

describe('bazaar search', () => {
  it('finds postal codes and towns of the five countries', () => {
    expect(locate(PLACES, '89073')?.country).toBe('DE');
    expect(locate(PLACES, 'ulm')?.label).toBe('Ulm');
    expect(locate(PLACES, 'München')).toBeDefined();
    expect(locate(PLACES, '6900')?.country).toBe('AT');
    expect(locate(PLACES, 'Atlantis')).toBeUndefined();
    expect(suggestPlaces(PLACES, 'Neu-U')).toContain('Neu-Ulm');
  });

  it('measures distances on the ground', () => {
    const ulm = locate(PLACES, 'Ulm')!.position;
    const munich = locate(PLACES, 'München')!.position;
    expect(distanceKm(ulm, munich)).toBeGreaterThan(110);
    expect(distanceKm(ulm, munich)).toBeLessThan(140);
  });

  it('keeps the bazaars within the radius', () => {
    const near = bazaar('near', { postalCode: '89073' });
    const blaustein = bazaar('blaustein', { postalCode: '89134' });
    const far = bazaar('far', { postalCode: '80331' });
    const unknown = bazaar('unknown');
    const found = search([far, blaustein, near, unknown], '89075');
    expect(found.map((f) => f.event._id).sort()).toEqual(['blaustein', 'near']);
    // Without a place: all of them, soonest first
    expect(search([far, unknown], '')).toHaveLength(2);
  });

  it('filters by time and conditions', () => {
    const past = bazaar('past', { startDate: NOW - 10 * DAY, endDate: NOW - 9 * DAY });
    const direct = bazaar('direct', { features: { directSale: true } });
    const pricey = bazaar('pricey', { commission: 25 });
    const filters = (conditions: string[], when = 'upcoming') => ({
      filters: { when, conditions, categories: [] },
    });
    expect(search([past, direct], '', filters([])).map((f) => f.event._id)).toEqual(['direct']);
    expect(search([past, direct], '', filters([], 'past')).map((f) => f.event._id)).toEqual([
      'past',
    ]);
    expect(search([direct, pricey], '', filters(['directSale'])).map((f) => f.event._id)).toEqual([
      'direct',
    ]);
    expect(
      search([direct, pricey], '', filters(['lowCommission'])).map((f) => f.event._id)
    ).toEqual(['direct']);
  });

  it('sorts by date within a radius, by distance for any distance', () => {
    const later = bazaar('later', {
      postalCode: '89073',
      startDate: NOW + 60 * DAY,
      endDate: NOW + 61 * DAY,
    });
    const sooner = bazaar('sooner', { postalCode: '89134' });
    expect(search([later, sooner], '89075').map((f) => f.event._id)).toEqual(['sooner', 'later']);
    expect(search([later, sooner], '89075', { radius: undefined }).map((f) => f.event._id)).toEqual(
      ['later', 'sooner']
    );
  });

  it('loads the places once, lazily', async () => {
    const loaded = await loadPlaces();
    expect(loaded.DE.codes).toBeDefined();
    expect(await loadPlaces()).toBe(loaded);
  });

  it('knows nothing of empty, too short or unknown queries', () => {
    expect(locate(PLACES, '   ')).toBeUndefined();
    expect(locate(PLACES, '00000')).toBeUndefined();
    expect(locate(PLACES, '890')?.country).toBe('DE');
    // Four digits are Austrian or Swiss: the label says which country
    const austrian = locate(PLACES, '8907');
    expect(austrian?.country).not.toBe('DE');
    expect(austrian?.label).toBe(`8907 (${austrian?.country})`);
    expect(locate(PLACES, '89073')?.label).toBe('89073');
    expect(locate({}, 'Ulm')).toBeUndefined();
    expect(suggestPlaces(PLACES, 'U')).toEqual([]);
    expect(suggestPlaces(PLACES, '89')).toEqual([]);
    expect(suggestPlaces(PLACES, 'Neu', 3)).toHaveLength(3);
    expect(suggestPlaces({}, 'Neu')).toEqual([]);
  });

  it('places a bazaar by its postal code, else by its town', () => {
    expect(eventPosition(PLACES, { postalCode: '89073' })).toBeDefined();
    expect(eventPosition(PLACES, { postalCode: '6900', country: 'at' })).toBeDefined();
    expect(eventPosition(PLACES, { postalCode: '1', city: 'Ulm' })).toEqual(
      locate(PLACES, 'Ulm')!.position
    );
    expect(eventPosition(PLACES, { postalCode: '00000', country: 'XX' })).toBeUndefined();
    expect(eventPosition(PLACES, { city: 'Atlantis' })).toBeUndefined();
    expect(eventPosition(PLACES, {})).toBeUndefined();
  });

  it('checks each condition', () => {
    const open = bazaar('open', { features: { registrationOpen: true } });
    expect(meetsCondition(open, 'registrationOpen', NOW)).toBe(true);
    expect(meetsCondition({ ...open, accessCode: 'x' }, 'registrationOpen', NOW)).toBe(false);
    expect(
      meetsCondition({ ...open, vendorLimit: 2, sellerCount: 2 }, 'registrationOpen', NOW)
    ).toBe(false);
    expect(
      meetsCondition(
        bazaar('closed', { features: { registrationOpen: false } }),
        'registrationOpen',
        NOW
      )
    ).toBe(false);
    expect(
      meetsCondition(
        bazaar('over', {
          features: { registrationOpen: true },
          startDate: NOW - 2 * DAY,
          endDate: NOW - DAY,
        }),
        'registrationOpen',
        NOW
      )
    ).toBe(false);

    expect(meetsCondition(bazaar('free'), 'noIntakeFee', NOW)).toBe(true);
    expect(meetsCondition(bazaar('fee', { features: { intakeFee: 2 } }), 'noIntakeFee', NOW)).toBe(
      false
    );
    expect(meetsCondition(bazaar('fee0', { features: { intakeFee: 0 } }), 'noIntakeFee', NOW)).toBe(
      true
    );

    const catalog = bazaar('catalog', { features: { publicCatalog: true, priceOffers: true } });
    const hidden = bazaar('hidden', { features: { publicCatalog: false, priceOffers: true } });
    expect(meetsCondition(catalog, 'onlineCatalog', NOW)).toBe(true);
    expect(meetsCondition(hidden, 'onlineCatalog', NOW)).toBe(false);
    expect(meetsCondition(catalog, 'priceOffers', NOW)).toBe(true);
    expect(meetsCondition(hidden, 'priceOffers', NOW)).toBe(false);
  });

  it('filters by the next four weeks and by categories, newest past first', () => {
    const soon = bazaar('soon', { categories: ['toys-lego' as Id<'categories'>] });
    const later = bazaar('later', { startDate: NOW + 60 * DAY, endDate: NOW + 61 * DAY });
    const filters = (when: string, categories: string[] = []) => ({
      filters: { when, conditions: [], categories },
      categories: [{ _id: 'toys-lego', parentCategory: 'toys' }],
    });
    expect(search([soon, later], '', filters('month')).map((f) => f.event._id)).toEqual(['soon']);
    expect(
      search([soon, later], '', filters('upcoming', ['toys'])).map((f) => f.event._id)
    ).toEqual(['soon']);
    expect(search([soon, later], '', filters('upcoming', ['books']))).toEqual([]);

    const old = bazaar('old', { startDate: NOW - 30 * DAY, endDate: NOW - 29 * DAY });
    const recent = bazaar('recent', { startDate: NOW - 3 * DAY, endDate: NOW - 2 * DAY });
    expect(search([old, recent], '', filters('past')).map((f) => f.event._id)).toEqual([
      'recent',
      'old',
    ]);
  });

  it('sorts equally far bazaars by date for any distance', () => {
    const a = bazaar('a', {
      postalCode: '89073',
      startDate: NOW + 9 * DAY,
      endDate: NOW + 9 * DAY,
    });
    const b = bazaar('b', { postalCode: '89073' });
    expect(search([a, b], '89075', { radius: undefined }).map((f) => f.event._id)).toEqual([
      'b',
      'a',
    ]);
  });
});
