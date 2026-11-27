import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import type { Doc } from '../lib/api/types';
import {
  CONDITIONS,
  WHEN,
  loadPlaces,
  locate,
  searchBazaars,
  type Condition,
  type Origin,
  type Places,
  type When,
} from '../lib/bazaarSearch';

type Category = Doc<'categories'>;

const DEFAULT_RADIUS = 25;

/**
 * The state of a bazaar search, kept in the address (`?q=89073&km=25&only=directSale`), so
 * a search can be shared and survives the way back from a bazaar.
 */
export function useBazaarSearch<E extends Doc<'events'>>(
  events: readonly E[] | undefined,
  categories: readonly Category[] | undefined
) {
  const [params, setParams] = useSearchParams();
  const { t } = useTranslation('events');
  const [places, setPlaces] = useState<Places>();

  const query = params.get('q') ?? '';
  // The own location, rounded to about a km: `?at=48.40,9.99`
  const at = (params.get('at') ?? '').split(',').map(Number);
  const here: Origin | undefined =
    at.length === 2 && at.every(Number.isFinite)
      ? { position: [at[0], at[1]], label: t('finder.here') }
      : undefined;
  const km = params.get('km');
  const radius = km === 'any' ? undefined : Number(km) || DEFAULT_RADIUS;
  const when = (WHEN as readonly string[]).includes(params.get('when') ?? '')
    ? (params.get('when') as When)
    : 'upcoming';
  const conditions = (params.get('only') ?? '')
    .split(',')
    .filter((value): value is Condition => (CONDITIONS as readonly string[]).includes(value));
  const chosenCategories = (params.get('cat') ?? '').split(',').filter(Boolean);

  useEffect(() => {
    let live = true;
    void loadPlaces().then((loaded) => live && setPlaces(loaded));
    return () => {
      live = false;
    };
  }, []);

  const origin = here ?? (places && query ? locate(places, query) : undefined);
  const unknown = !!places && !!query && !here && !origin;

  const update = (changes: Record<string, string | undefined>) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true }
    );

  const [now] = useState(() => Date.now());
  const results = useMemo(
    () =>
      !events
        ? undefined
        : // An unknown place filters nothing: all bazaars by date, the field says why
          searchBazaars(events, {
            places,
            origin,
            radius,
            filters: { when, conditions, categories: chosenCategories },
            categories,
            now,
          }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the arrays follow the address
    [events, places, origin?.label, unknown, radius, when, params, categories, now]
  );

  return {
    query,
    origin,
    unknown,
    places,
    radius,
    when,
    conditions,
    chosenCategories,
    results,
    filtered: conditions.length > 0 || chosenCategories.length > 0 || when !== 'upcoming',
    search: (text: string) => update({ q: text.trim() || undefined, at: undefined }),
    useHere: ([latitude, longitude]: [number, number]) =>
      update({ q: undefined, at: `${latitude.toFixed(2)},${longitude.toFixed(2)}` }),
    setRadius: (value: number | undefined) =>
      update({
        km: value === undefined ? 'any' : value === DEFAULT_RADIUS ? undefined : String(value),
      }),
    setWhen: (value: When) => update({ when: value === 'upcoming' ? undefined : value }),
    toggleCondition: (condition: Condition) =>
      update({
        only: (conditions.includes(condition)
          ? conditions.filter((other) => other !== condition)
          : [...conditions, condition]
        ).join(','),
      }),
    toggleCategory: (id: string) =>
      update({
        cat: (chosenCategories.includes(id)
          ? chosenCategories.filter((other) => other !== id)
          : [...chosenCategories, id]
        ).join(','),
      }),
    reset: () => update({ only: undefined, cat: undefined, when: undefined }),
  };
}

export type BazaarSearchState<E extends Doc<'events'>> = ReturnType<typeof useBazaarSearch<E>>;
