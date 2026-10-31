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
  keepAsNewest: vi.fn(),
  onAuthChange: () => () => {},
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
    // The event's answers are asked once; kept as the newest without asking again
    expect(client.batchQuery).toHaveBeenCalledOnce();
    expect(client.keepAsNewest).toHaveBeenCalledOnce();
  });

  it('shows a job of another page in every view, and the state of the current event', async () => {
    const card = renderHook(() => prefetch.useOfflinePreparation('evt1', event(10 * DAY), true));
    const desk = renderHook(() => prefetch.useOfflinePreparation('evt1', event(10 * DAY), true));
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const answer = client.batchQuery.getMockImplementation()!;
    client.batchQuery.mockImplementationOnce(async (calls: { fn: unknown }[]) => {
      await gate;
      return answer(calls);
    });

    let job: Promise<void> = Promise.resolve();
    act(() => void (job = desk.result.current.prepare()));
    expect(card.result.current.preparing).toBe(true);
    release();
    await act(() => job);
    expect(card.result.current.preparing).toBe(false);
    expect(card.result.current.prepared?.products).toBe(0);

    const other = renderHook(
      ({ id }) => prefetch.useOfflinePreparation(id, event(10 * DAY), true),
      {
        initialProps: { id: 'evt1' },
      }
    );
    expect(other.result.current.prepared).not.toBeNull();
    other.rerender({ id: 'evt2' });
    expect(other.result.current.prepared).toBeNull();
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

  it('loads completely on the button also while an update runs', async () => {
    const at = Date.now() - 10 * 60_000;
    prepared({ products: 0, at, fullAt: at, stamp: { keys: 'k0', products: 'p1' } });
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const answer = client.batchQuery.getMockImplementation()!;
    client.batchQuery.mockImplementationOnce(async (calls: { fn: unknown }[]) => {
      await gate;
      return answer(calls);
    });
    const { result } = renderHook(() => prefetch.useOfflinePreparation('evt1', event(DAY), true));
    await waitFor(() => expect(client.batchQuery).toHaveBeenCalledOnce());

    const full = act(() => result.current.prepare());
    release();
    await full;
    expect(result.current.prepared?.fullAt).toBeGreaterThan(at);
  });

  it('keeps what is on the device when loading fails, and tells the button why', async () => {
    client.batchQuery.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() =>
      prefetch.useOfflinePreparation('evt1', event(10 * DAY), true)
    );
    await act(() => expect(result.current.prepare()).rejects.toThrow('Failed to fetch'));
    expect(result.current.preparing).toBe(false);
    expect(result.current.prepared).toBeNull();

    // A refused item page: not on the device as a whole
    client.batchQuery
      .mockReset()
      .mockImplementationOnce(async (calls: { fn: unknown }[]) =>
        calls.map((_, index) =>
          index === 4 ? [{ _id: 'p1' }] : index === calls.length - 1 ? stamp : []
        )
      )
      .mockImplementation(async (calls: { fn: unknown }[]) => calls.map(() => undefined));
    await act(() => expect(result.current.prepare()).rejects.toBeInstanceOf(prefetch.Incomplete));
    expect(result.current.prepared).toBeNull();
  });
});
