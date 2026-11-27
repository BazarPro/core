import { describe, expect, it } from 'vitest';
import type { Id } from '../lib/api/types';
import { filterAndSortProducts, type ProductForFilter } from './useMyProductsFilters';

const item = (id: string, extra: Partial<ProductForFilter> = {}): ProductForFilter => ({
  _id: id as Id<'products'>,
  title: id,
  price: 5,
  sold: false,
  eventIds: ['e1'],
  description: '',
  images: [],
  productCategory: 'c1' as Id<'categories'>,
  ...extra,
});

const state = {
  searchTerm: '',
  filterEvent: 'all',
  filterCategory: 'all',
  filterStatus: 'labelMissing',
  sortBy: 'newest',
  minPrice: '',
  maxPrice: '',
};

describe('filterAndSortProducts', () => {
  it('finds the unsold items whose label is missing', () => {
    const result = filterAndSortProducts(
      [item('missing'), item('printed', { labelPrintedAt: 1 }), item('sold', { sold: true })],
      state
    );
    expect(result.map((p) => p._id)).toEqual(['missing']);
  });
});

describe('labelMissing', () => {
  it('is no topic once the item was taken in at the bazaar', () => {
    expect(filterAndSortProducts([item('in', { eventStatus: 'available' })], state)).toEqual([]);
    expect(
      filterAndSortProducts([item('announced', { eventStatus: 'announced' })], state)
    ).toHaveLength(1);
  });
});

describe('filtering and sorting "My items"', () => {
  const items = [
    item('Roller', { price: 30, _creationTime: 1, discountPercent: 10 }),
    item('Ball', { price: 5, _creationTime: 3, sold: true }),
    item('Anorak', { price: 12, _creationTime: 2, eventIds: ['e2'] }),
  ];
  const all = { ...state, filterStatus: 'all' };
  const titles = (list: ProductForFilter[]) => list.map((p) => p.title);

  it('sorts by every option and keeps the input as it is', () => {
    expect(titles(filterAndSortProducts(items, { ...all, sortBy: 'newest' }))).toEqual([
      'Ball',
      'Anorak',
      'Roller',
    ]);
    expect(titles(filterAndSortProducts(items, { ...all, sortBy: 'name' }))).toEqual([
      'Anorak',
      'Ball',
      'Roller',
    ]);
    expect(titles(filterAndSortProducts(items, { ...all, sortBy: 'discount' }))[0]).toBe('Roller');
    expect(titles(filterAndSortProducts(items, { ...all, sortBy: 'price-asc' }))).toEqual([
      'Ball',
      'Anorak',
      'Roller',
    ]);
    expect(titles(filterAndSortProducts(items, { ...all, sortBy: 'price-desc' }))).toEqual([
      'Roller',
      'Anorak',
      'Ball',
    ]);
    expect(titles(items)).toEqual(['Roller', 'Ball', 'Anorak']);
  });

  it('filters by search, bazaar, state and price', () => {
    expect(titles(filterAndSortProducts(items, { ...all, searchTerm: 'ROL' }))).toEqual(['Roller']);
    expect(titles(filterAndSortProducts(items, { ...all, filterEvent: 'e2' }))).toEqual(['Anorak']);
    expect(titles(filterAndSortProducts(items, { ...all, filterStatus: 'sold' }))).toEqual([
      'Ball',
    ]);
    expect(
      titles(filterAndSortProducts(items, { ...all, filterStatus: 'available', sortBy: 'name' }))
    ).toEqual(['Anorak', 'Roller']);
    expect(
      titles(filterAndSortProducts(items, { ...all, minPrice: '10', maxPrice: '20' }))
    ).toEqual(['Anorak']);
  });

  it('takes the sub-categories of a main category along', () => {
    const shoes = item('Schuhe', { productCategory: 'sub' as Id<'categories'> });
    const result = filterAndSortProducts([shoes, item('Andere')], {
      ...all,
      filterCategory: 'main',
      categories: [{ _id: 'main' }, { _id: 'sub', parentCategory: 'main' }],
    });
    expect(titles(result)).toEqual(['Schuhe']);
  });
});
