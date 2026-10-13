import { describe, expect, it } from 'vitest';
import { matchesPublicStatusFilter } from './eventProductStatus';

const item = (status: string, sold = false) => ({ status, sold });

describe('matchesPublicStatusFilter', () => {
  it('shows only handed-in, unsold items as available while the event runs', () => {
    const visible = ['announced', 'available', 'sold', 'returned'].filter((status) =>
      matchesPublicStatusFilter(item(status, status === 'sold'), 'available', true)
    );
    expect(visible).toEqual(['available']);
  });

  it('shows announced items as available before the event', () => {
    const visible = ['announced', 'available', 'sold', 'returned'].filter((status) =>
      matchesPublicStatusFilter(item(status, status === 'sold'), 'available', false)
    );
    expect(visible).toEqual(['announced', 'available']);
  });

  it('keeps the sold and all filters', () => {
    expect(matchesPublicStatusFilter(item('sold', true), 'sold', true)).toBe(true);
    expect(matchesPublicStatusFilter(item('available'), 'sold', true)).toBe(false);
    expect(matchesPublicStatusFilter(item('returned'), 'all', true)).toBe(true);
  });
});
