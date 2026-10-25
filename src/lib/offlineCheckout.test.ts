import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from './api/client';
import { getFunctionName } from './api/functions';
import {
  OFFLINE_FLAG_KEY,
  downloadSnapshot,
  enqueueSale,
  flushQueue,
  isOfflineCheckoutAvailable,
  loadOfflineState,
  lookupOffline,
  resetOfflineCheckout,
  type CheckoutSnapshot,
  type OfflineSale,
} from './offlineCheckout';

const item = (id: string, status: 'available' | 'sold' = 'available') =>
  ({
    eventProductId: `ep-${id}`,
    productId: id,
    title: `Artikel ${id}`,
    image: null,
    status,
    price: 10,
    discountPercent: undefined,
    listPrice: 10,
    minimumPrice: undefined,
    sellerPaidOut: false,
    attributes: [],
    offers: [],
  }) as unknown as CheckoutSnapshot['items'][number];

const snapshot = (...ids: string[]): CheckoutSnapshot => ({
  takenAt: 1_000,
  items: ids.map((id) => item(id)),
});

const sale = (id: string, ...products: string[]): OfflineSale =>
  ({
    deskSaleId: id,
    soldAt: 2_000,
    items: products.map((product) => ({
      eventProductId: `ep-${product}`,
      productId: product,
      title: `Artikel ${product}`,
      paid: 10,
      priceSource: 'list',
    })),
  }) as OfflineSale;

function fakeClient(handlers: {
  query?: (name: string, args: unknown) => unknown;
  mutation?: (name: string, args: unknown) => unknown;
}) {
  return {
    query: vi.fn(async (fn: unknown, args: unknown) => handlers.query?.(getFunctionName(fn), args)),
    mutation: vi.fn(async (fn: unknown, args: unknown) =>
      handlers.mutation?.(getFunctionName(fn), args)
    ),
  } as unknown as ApiClient & {
    query: ReturnType<typeof vi.fn>;
    mutation: ReturnType<typeof vi.fn>;
  };
}

/** The backend books every sale it gets; `conflicts` per sale ID */
const bookAll =
  (conflicts: Record<string, string[]> = {}) =>
  (_: string, args: unknown) =>
    (args as { sales: OfflineSale[] }).sales.map((s) => ({
      deskSaleId: s.deskSaleId,
      bookedNow: true,
      purchaseIds: [],
      conflicts: conflicts[s.deskSaleId] ?? [],
    }));

describe('offline cash desk', () => {
  beforeEach(() => {
    localStorage.clear();
    resetOfflineCheckout();
  });

  it('is only available in the app, or in the browser with the test flag', () => {
    expect(isOfflineCheckoutAvailable()).toBe(false);
    localStorage.setItem(OFFLINE_FLAG_KEY, '1');
    expect(isOfflineCheckoutAvailable()).toBe(true);
  });

  it('finds a scanned product in the copy of the items', async () => {
    const client = fakeClient({ query: () => snapshot('a', 'b') });
    await downloadSnapshot(client, 'evt');
    const { snapshot: copy } = await loadOfflineState('evt');
    expect(lookupOffline(copy, 'b')?.eventProductId).toBe('ep-b');
    expect(lookupOffline(copy, 'x')).toBeNull();
    expect(lookupOffline(null, 'a')).toBeNull();
  });

  it('keeps sales on the device and marks their items sold, also in a new copy', async () => {
    const client = fakeClient({ query: () => snapshot('a', 'b') });
    await downloadSnapshot(client, 'evt');
    await enqueueSale('evt', sale('s1', 'a'));
    // The same sale twice (a double click) is queued once
    await enqueueSale('evt', sale('s1', 'a'));

    let state = await loadOfflineState('evt');
    expect(state.queue).toHaveLength(1);
    expect(lookupOffline(state.snapshot, 'a')?.status).toBe('sold');
    expect(lookupOffline(state.snapshot, 'b')?.status).toBe('available');

    // Still there after a restart of the app
    resetOfflineCheckout();
    state = await loadOfflineState('evt');
    expect(state.queue.map((s) => s.deskSaleId)).toEqual(['s1']);

    // A fresh copy from the backend does not know the queued sale yet
    await downloadSnapshot(client, 'evt');
    state = await loadOfflineState('evt');
    expect(lookupOffline(state.snapshot, 'a')?.status).toBe('sold');
  });

  it('books the queue in batches of 50 and counts the conflicts', async () => {
    for (let i = 0; i < 60; i++) await enqueueSale('evt', sale(`s${i}`, `p${i}`));
    const client = fakeClient({ mutation: bookAll({ s3: ['p3'] }) });

    const result = await flushQueue(client, 'evt');

    expect(result).toEqual({ booked: 60, conflicts: 1 });
    expect(client.mutation).toHaveBeenCalledTimes(2);
    expect((client.mutation.mock.calls[0][1] as { sales: unknown[] }).sales).toHaveLength(50);
    expect((await loadOfflineState('evt')).queue).toEqual([]);
  });

  it('keeps the queue when the connection is gone and runs one sync at a time', async () => {
    await enqueueSale('evt', sale('s1', 'a'));
    const offline = fakeClient({
      mutation: () => {
        throw new TypeError('Failed to fetch');
      },
    });
    await expect(flushQueue(offline, 'evt')).rejects.toThrow('Failed to fetch');
    expect((await loadOfflineState('evt')).queue).toHaveLength(1);

    const online = fakeClient({ mutation: bookAll() });
    const [first, second] = await Promise.all([
      flushQueue(online, 'evt'),
      flushQueue(online, 'evt'),
    ]);
    // One request; the booked sale counts once
    expect([first, second]).toEqual([
      { booked: 1, conflicts: 0 },
      { booked: 0, conflicts: 0 },
    ]);
    expect(online.mutation).toHaveBeenCalledTimes(1);
  });

  it('does not count a sale an earlier sync already booked', async () => {
    await enqueueSale('evt', sale('s1', 'a'));
    const client = fakeClient({
      mutation: () => [{ deskSaleId: 's1', bookedNow: false, purchaseIds: ['p'], conflicts: [] }],
    });
    expect(await flushQueue(client, 'evt')).toEqual({ booked: 0, conflicts: 0 });
    expect((await loadOfflineState('evt')).queue).toEqual([]);
  });
});
