import type { Doc } from './api/types';
import { getRegistrationState, resolveEventFeatures } from '../shared/eventFeatures';
import { postalCodeDigits } from '../shared/postalCodes';
import { spotsLeft } from '../components/participation/registrationText';
import { isEventOver } from '../shared/eventPhase';
import { withSubcategories } from '../shared/categoryTree';

/** Latitude and longitude */
export type LatLon = [number, number];

interface CountryPlaces {
  /** Middle of every area (first three digits) and region (first two) */
  codes: Record<string, LatLon>;
  places: Record<string, LatLon>;
}
export type Places = Record<string, CountryPlaces>;

let loading: Promise<Places> | undefined;

/**
 * Where postal codes and towns are (scripts/postal-areas/centroids.mjs): loaded only on the
 * search, it is too large for every page. Nothing is asked of a third party.
 */
export function loadPlaces(): Promise<Places> {
  loading ??= import('../assets/postal-centroids.json').then(
    (module) => (module as unknown as { default: Places }).default
  );
  loading.catch(() => (loading = undefined));
  return loading;
}

/** Germany first; four digits are Austria, Switzerland, Luxembourg or Liechtenstein. */
const COUNTRY_ORDER = ['DE', 'AT', 'CH', 'LU', 'LI'];

function codePosition(places: Places, code: string, country?: string): LatLon | undefined {
  const digits = postalCodeDigits(code);
  if (digits.length < 2) return undefined;
  const countries = country
    ? [country.toUpperCase()]
    : COUNTRY_ORDER.filter((candidate) => (digits.length === 5) === (candidate === 'DE'));
  for (const candidate of countries) {
    const codes = places[candidate]?.codes;
    const found = codes?.[digits.slice(0, 3)] ?? codes?.[digits.slice(0, 2)];
    if (found) return found;
  }
  return undefined;
}

const fold = (text: string) =>
  text.trim().toLocaleLowerCase('de').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');

export interface Origin {
  position: LatLon;
  /** What was found: "89073" or "Ulm" */
  label: string;
  /** The postal code searched for, to check the region of a bazaar */
  postalCode?: string;
  country?: string;
}

/** A postal code ("89073", "890") or a town ("Ulm"); undefined when it is not known. */
export function locate(places: Places, query: string): Origin | undefined {
  const text = query.trim();
  if (!text) return undefined;
  if (/^\d/.test(text)) {
    const digits = postalCodeDigits(text);
    for (const country of COUNTRY_ORDER) {
      if ((digits.length === 5) !== (country === 'DE') && digits.length >= 4) continue;
      const position = codePosition(places, digits, country);
      // Four digits are Austrian or Swiss: the country says so, "8907 (AT)"
      if (position)
        return {
          position,
          label: country === 'DE' ? digits : `${digits} (${country})`,
          postalCode: digits,
          country,
        };
    }
    return undefined;
  }
  const wanted = fold(text);
  for (const country of COUNTRY_ORDER) {
    for (const [name, position] of Object.entries(places[country]?.places ?? {})) {
      if (fold(name) === wanted) return { position, label: name, country };
    }
  }
  return undefined;
}

/** Up to `max` towns starting with the text, for the suggestions under the field. */
export function suggestPlaces(places: Places, query: string, max = 6): string[] {
  const wanted = fold(query);
  if (wanted.length < 2 || /^\d/.test(wanted)) return [];
  const found: string[] = [];
  for (const country of COUNTRY_ORDER) {
    for (const name of Object.keys(places[country]?.places ?? {})) {
      if (fold(name).startsWith(wanted) && !found.includes(name)) found.push(name);
      if (found.length >= max) return found;
    }
  }
  return found;
}

/** Where a bazaar takes place: its postal code, else its town. */
export function eventPosition(
  places: Places,
  event: Pick<Doc<'events'>, 'postalCode' | 'country' | 'city'>
): LatLon | undefined {
  if (event.postalCode) {
    const position = codePosition(places, event.postalCode, event.country || 'DE');
    if (position) return position;
  }
  return event.city ? locate(places, event.city)?.position : undefined;
}

/** Distance on the ground in km. */
export function distanceKm([lat1, lon1]: LatLon, [lat2, lon2]: LatLon): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

export const RADII = [10, 25, 50, 100] as const;
export const WHEN = ['upcoming', 'month', 'past'] as const;
export type When = (typeof WHEN)[number];

/** The conditions a seller may care about, each a chip on the search; the first ones show */
export const CONDITIONS = [
  'registrationOpen',
  'lowCommission',
  'noIntakeFee',
  'directSale',
  'onlineCatalog',
  'priceOffers',
] as const;
export type Condition = (typeof CONDITIONS)[number];

/** Commission up to this many percent counts as low */
export const LOW_COMMISSION = 15;

export interface SearchFilters {
  when: When;
  conditions: Condition[];
  /** Main categories; a bazaar matches with one of them or of their sub-categories */
  categories: string[];
}

type SearchEvent = Doc<'events'>;

/** Whether a bazaar meets one condition. */
export function meetsCondition(event: SearchEvent, condition: Condition, now: number): boolean {
  const features = resolveEventFeatures(event);
  switch (condition) {
    case 'registrationOpen':
      return (
        !isEventOver(event, now) &&
        getRegistrationState(event, now).open &&
        spotsLeft(event) !== 0 &&
        !event.accessCode
      );
    case 'lowCommission':
      return event.commission <= LOW_COMMISSION;
    case 'noIntakeFee':
      return !(features.intakeFee && features.intakeFee > 0);
    case 'directSale':
      return !!features.directSale;
    case 'onlineCatalog':
      return features.publicCatalog;
    case 'priceOffers':
      return features.publicCatalog && features.priceOffers;
  }
}

export interface Found<E> {
  event: E;
  /** km from the place searched for; undefined without a place or a known address */
  distance?: number;
}

/**
 * The bazaars around a place that meet the filters, soonest first: within a radius the
 * date matters more than a few km. Only for any distance the nearest come first. Bazaars
 * whose address is not known stay out of a search around a place.
 */
export function searchBazaars<E extends SearchEvent>(
  events: readonly E[],
  {
    places,
    origin,
    radius,
    filters,
    categories,
    now,
  }: {
    places: Places | undefined;
    origin: Origin | undefined;
    /** km; undefined: any distance */
    radius: number | undefined;
    filters: SearchFilters;
    categories: readonly { _id: string; parentCategory?: string }[] | undefined;
    now: number;
  }
): Found<E>[] {
  const wantedCategories = filters.categories.map((id) => withSubcategories(id, categories));
  const fourWeeks = now + 28 * 24 * 60 * 60 * 1000;
  const found: Found<E>[] = [];
  for (const event of events) {
    const over = isEventOver(event, now);
    if (filters.when === 'past' ? !over : over) continue;
    if (filters.when === 'month' && event.startDate > fourWeeks) continue;
    if (!filters.conditions.every((condition) => meetsCondition(event, condition, now))) {
      continue;
    }
    if (
      wantedCategories.length > 0 &&
      !wantedCategories.some((ids) => event.categories.some((id) => ids.has(id)))
    ) {
      continue;
    }
    let distance: number | undefined;
    if (origin && places) {
      const position = eventPosition(places, event);
      if (!position) continue;
      distance = distanceKm(origin.position, position);
      if (radius !== undefined && distance > radius) continue;
    }
    found.push({ event, distance });
  }
  const byDate = (a: Found<E>, b: Found<E>) =>
    filters.when === 'past'
      ? b.event.startDate - a.event.startDate
      : a.event.startDate - b.event.startDate;
  return found.sort((a, b) =>
    radius === undefined && a.distance !== undefined && b.distance !== undefined
      ? a.distance - b.distance || byDate(a, b)
      : byDate(a, b)
  );
}
