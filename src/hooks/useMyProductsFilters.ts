import type { Id } from '../../convex/_generated/dataModel';

export interface ProductForFilter {
  _id: Id<'products'>;
  title: string;
  price: number;
  sold: boolean;
  eventIds: string[];
  description: string;
  images: Id<'_storage'>[];
  productCategory: Id<'categories'>;
}

export interface MyProductsFilterState {
  searchTerm: string;
  filterEvent: string;
  filterCategory: string;
  filterStatus: string;
  sortBy: string;
  minPrice: string;
  maxPrice: string;
}

/**
 * Filters and sorts a product list by search term, event, status, price range, and sort option.
 * Returns a new array; does not mutate the input.
 */
export function filterAndSortProducts<T extends ProductForFilter>(
  products: T[],
  state: MyProductsFilterState
): T[] {
  let filtered = products.filter((p) => {
    const matchesSearch = p.title.toLowerCase().includes(state.searchTerm.toLowerCase());
    const matchesEvent = state.filterEvent === 'all' || p.eventIds.includes(state.filterEvent);
    const matchesCategory =
      state.filterCategory === 'all' || p.productCategory === state.filterCategory;
    const matchesStatus =
      state.filterStatus === 'all' ||
      (state.filterStatus === 'sold' && p.sold) ||
      (state.filterStatus === 'available' && !p.sold);
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

  if (state.sortBy === 'price-asc') {
    filtered = [...filtered].sort((a, b) => a.price - b.price);
  } else if (state.sortBy === 'price-desc') {
    filtered = [...filtered].sort((a, b) => b.price - a.price);
  }

  return filtered;
}
