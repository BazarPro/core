import { beforeEach, describe, expect, it } from 'vitest';
import {
  getCurrentPath,
  popToPrevious,
  pushHistory,
  readHistory,
  visit,
} from './navigation-history';

beforeEach(() => sessionStorage.clear());

/** Visits the pages in order, like the NavigationHistoryProvider does. */
function browse(paths: string[], role: 'participant' | null = null) {
  for (const path of paths) pushHistory(path, role);
}

describe('navigation history', () => {
  it('does not retrace going back and forth between an event and its items', () => {
    browse([
      '/browse-events',
      '/public-events/e1',
      '/products/view/p1',
      '/public-events/e1',
      '/products/view/p2',
      '/public-events/e1',
    ]);
    // Back from the event leads where the event was opened from, not to the items again
    expect(popToPrevious('/public-events/e1')).toBe('/browse-events');
  });

  it('goes back from an item to its event', () => {
    browse(['/browse-events', '/public-events/e1', '/products/view/p1', '/public-events/e1']);
    browse(['/products/view/p2']);
    expect(popToPrevious('/products/view/p2')).toBe('/public-events/e1');
    expect(popToPrevious('/public-events/e1')).toBe('/browse-events');
  });

  it('leads back to the overview from a page opened there', () => {
    browse(['/my-products', '/', '/products/new'], 'participant');
    expect(popToPrevious('/products/new', 'participant')).toBe('/');
  });

  it('adds a new page and keeps a reload of the same page once', () => {
    expect(visit(['/a'], '/b')).toEqual(['/a', '/b']);
    expect(visit(['/a', '/b'], '/b')).toEqual(['/a', '/b']);
    expect(visit(['/a', '/b', '/c'], '/a')).toEqual(['/a']);
  });

  it('falls back to the pages of no role when the role has no earlier page', () => {
    browse(['/public-events/e1']);
    browse(['/my-products'], 'participant');
    expect(popToPrevious('/my-products', 'participant')).toBe('/public-events/e1');
  });

  it('keeps query and anchor, and ignores broken stored data', () => {
    expect(getCurrentPath({ pathname: '/my-products', search: '?tab=sold', hash: '#p1' })).toBe(
      '/my-products?tab=sold#p1'
    );
    expect(getCurrentPath({ pathname: '/my-products' })).toBe('/my-products');
    sessionStorage.setItem('navHistory.global', '{"kein":"Array"}');
    expect(readHistory('navHistory.global')).toEqual([]);
    sessionStorage.setItem('navHistory.global', 'kaputt');
    expect(readHistory('navHistory.global')).toEqual([]);
    expect(popToPrevious('/irgendwo')).toBeNull();
  });
});
