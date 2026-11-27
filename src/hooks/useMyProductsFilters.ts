import type { Id } from '../lib/api/types';
import { withSubcategories } from '../shared/categoryTree';

export interface ProductForFilter {
  _id: Id<'products'>;
  title: string;
  price: number;
  sold: boolean;
  eventIds: string[];
  description: string;
  images: Id<'_storage'>[];
  productCategory: Id<'categories'>;
  _creationTime?: number;
  discountPercent?: number;
  /** When its label was last printed */
  labelPrintedAt?: number;
  /** State at the running bazaar: once taken in, the label is attached */
  eventStatus?: string;
}

export interface MyProductsFilterState {
  searchTerm: string;
  filterEvent: string;
  filterCategory: string;
  filterStatus: string;
  sortBy: string;
  minPrice: string;
  maxPrice: string;
  /** For the filter on a main category, which also shows its sub-categories */
  categories?: readonly { _id: string; parentCategory?: string }[];
}

/** Unsold, never printed (or changed since), and not yet taken in at a bazaar. */
export function labelMissing(p: ProductForFilter): boolean {
  return (
    !p.sold &&
    p.labelPrintedAt === undefined &&
    (p.eventStatus === undefined || p.eventStatus === 'announced')
  );
}

/**
 * Filters and sorts a product list by search term, event, status, price range, and sort option.
 * Returns a new array; does not mutate the input.
 */
export function filterAndSortProducts<T extends ProductForFilter>(
  products: T[],
  state: MyProductsFilterState
): T[] {
  const inCategory =
    state.filterCategory === 'all'
      ? undefined
      : withSubcategories(state.filterCategory, state.categories);
  let filtered = products.filter((p) => {
    const matchesSearch = p.title.toLowerCase().includes(state.searchTerm.toLowerCase());
    const matchesEvent = state.filterEvent === 'all' || p.eventIds.includes(state.filterEvent);
    const matchesCategory = !inCategory || inCategory.has(p.productCategory);
    const matchesStatus =
      state.filterStatus === 'all' ||
      (state.filterStatus === 'sold' && p.sold) ||
      (state.filterStatus === 'available' && !p.sold) ||
      (state.filterStatus === 'labelMissing' && labelMissing(p));
    const matchesMinPrice = state.minPrice === '' || p.price >= parseFloat(state.minPrice);
    const matchesMaxPrice = state.maxPrice === '' || p.price <= parseFloat(state.maxPrice);
    return (
      matchesSearch &&
      matchesEvent &&
      matchesCategory &&
      matchesStatus &&
      matchesMinPrice &&
      matchesMaxPrice
    );
  });

  if (state.sortBy === 'newest') {
    filtered = [...filtered].sort((a, b) => (b._creationTime ?? 0) - (a._creationTime ?? 0));
  } else if (state.sortBy === 'name') {
    filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title));
  } else if (state.sortBy === 'discount') {
    filtered = [...filtered].sort((a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0));
  } else if (state.sortBy === 'price-asc') {
    filtered = [...filtered].sort((a, b) => a.price - b.price);
  } else if (state.sortBy === 'price-desc') {
    filtered = [...filtered].sort((a, b) => b.price - a.price);
  }

  return filtered;
}
