import { describe, expect, it } from 'vitest';
import { isOnOffer } from './eventProductStatus';

describe('isOnOffer', () => {
  it('offers only handed-in, unsold items', () => {
    const visible = ['announced', 'available', 'sold', 'returned'].filter((status) =>
      isOnOffer({ status, sold: status === 'sold' })
    );
    expect(visible).toEqual(['available']);
  });

  it('leaves out an item sold but not yet marked so on its listing', () => {
    expect(isOnOffer({ status: 'available', sold: true })).toBe(false);
  });
});
