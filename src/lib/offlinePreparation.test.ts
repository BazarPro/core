import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConnected, useQuery } from './api/react';
import * as prefetch from './offlinePrefetch';
import { isOfflineAvailable } from './offlineMode';

vi.mock('./api/react', () => ({
  useApiClient: vi.fn(() => client),
  useConnected: vi.fn(),
  useQuery: vi.fn(),
}));
vi.mock('./offlineMode', () => ({ isOfflineAvailable: vi.fn() }));
vi.mock('./checkInCode', () => ({ fetchEventKeys: vi.fn() }));
vi.mock('./offlineCheckout', () => ({ downloadSnapshot: vi.fn() }));

const DAY = 24 * 3_600_000;
const STAMP = { keys: 'k1', products: 'p1' };
let stamp: typeof STAMP | undefined = STAMP;
/** Only what the hook asks itself: the item and seller lists are on the device */
const client = {
  isOnDevice: () => true,
  persistNow: () => Promise.resolve(true),
  batchQuery: vi.fn(),
};

function event(startsIn: number) {
  return { startDate: Date.now() + startsIn, endDate: Date.now() + startsIn + 5 * 3_600_000 };
}

function prepared(result: prefetch.PrepareResult) {
  localStorage.setItem('bazarpro:offline-prepared:evt1', JSON.stringify(result));
}

describe('useOfflinePreparation', () => {
  beforeEach(() => {
    localStorage.clear();
    stamp = STAMP;
    vi.useRealTimers();
    vi.mocked(isOfflineAvailable).mockReturnValue(true);
    vi.mocked(useConnected).mockReturnValue(true);
    vi.mocked(useQuery).mockImplementation(((_: unknown, args: unknown) =>
      args === 'skip' ? undefined : stamp) as unknown as typeof useQuery);
    // Every call answers with an empty bazaar
    client.batchQuery
      .mockReset()
      .mockImplementation(async (calls: { fn: unknown }[]) =>
        calls.map((_, index) => (index === calls.length - 1 ? stamp : []))
      );
  });

  it('prepares a bazaar starting soon completely, on its own', async () => {
    const { result } = renderHook(() => prefetch.useOfflinePreparation('evt1', event(DAY), true));
    expect(result.current.available).toBe(true);
    await waitFor(() => expect(result.current.prepared?.fullAt).toBeDefined());
    expect(result.current.prepared?.stamp).toEqual(STAMP);
  });

  it('leaves a bazaar far ahead to the button, and past ones alone', async () => {
    const { result } = renderHook(() =>
      prefetch.useOfflinePreparation('evt1', event(10 * DAY), true)
    );
    expect(result.current.available).toBe(true);
    await act(() => Promise.resolve());
    expect(client.batchQuery).not.toHaveBeenCalled();

    const past = renderHook(() => prefetch.useOfflinePreparation('evt1', event(-3 * DAY), true));
    expect(past.result.current.available).toBe(false);
    const helperless = renderHook(() => prefetch.useOfflinePreparation('evt1', event(DAY), false));
    expect(helperless.result.current.available).toBe(false);

    await act(() => result.current.prepare());
    expect(result.current.prepared?.products).toBe(0);
  });

  it('loads only what is new once the backend has more than the copy', async () => {
    const at = Date.now() - 10 * 60_000;
    prepared({ products: 0, at, fullAt: at, stamp: { keys: 'k0', products: 'p1' } });
    const { result } = renderHook(() => prefetch.useOfflinePreparation('evt1', event(DAY), true));
    expect(result.current.outdated).toBe(true);
    await waitFor(() => expect(result.current.outdated).toBe(false));
    // Not completely again: the full copy is recent
    expect(result.current.prepared?.fullAt).toBe(at);
    expect(client.batchQuery).toHaveBeenCalledOnce();
  });

  it('keeps what is on the device when loading fails', async () => {
    client.batchQuery.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() =>
      prefetch.useOfflinePreparation('evt1', event(10 * DAY), true)
    );
    await act(() => result.current.prepare());
    expect(result.current.preparing).toBe(false);
    expect(result.current.prepared).toBeNull();
  });
});
