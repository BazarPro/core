import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from './api/client';
import { useConnected } from './api/react';
import { memoryQueries } from './api/persistedQueries';
import {
  loadQueue,
  resetOfflineActions,
  runIntakeAction,
  useOfflineIntake,
  type IntakeAction,
} from './offlineActions';
import { OFFLINE_FLAG_KEY, useDisconnected } from './offlineMode';

vi.mock('./api/react', () => ({
  useApiClient: vi.fn(() => client),
  useConnected: vi.fn(),
}));
vi.mock('./offlineMode', async (original) => ({
  ...(await original<typeof import('./offlineMode')>()),
  useDisconnected: vi.fn(),
}));

const EVENT = 'evt1';
const accept: IntakeAction = {
  name: 'eventProducts.updateProductStatus',
  args: { eventProductId: 'ep1' as never, status: 'available' },
};

let client: ApiClient;

/** Without connection: the action goes into the queue on the device */
async function queued(label: string) {
  await runIntakeAction(client, EVENT, accept, label, true);
}

/** Answers a replay by taking every action */
function takeAll() {
  return vi
    .spyOn(client, 'mutation')
    .mockImplementation((async (_: unknown, args: { actions: { id: string }[] }) =>
      args.actions.map(({ id }) => ({ id, doneNow: true }))) as never);
}

function online(connected: boolean) {
  vi.mocked(useConnected).mockReturnValue(connected);
  vi.mocked(useDisconnected).mockReturnValue(!connected);
}

describe('useOfflineIntake', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(OFFLINE_FLAG_KEY, '1');
    resetOfflineActions();
    client = new ApiClient();
    client.setPersistence(memoryQueries());
    online(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does nothing without an event', async () => {
    const { result } = renderHook(() => useOfflineIntake(undefined));
    expect(result.current.pending).toBe(0);
    expect(result.current.refusedWith).toBeUndefined();
    expect(() => result.current.run(accept, 'Ski')).toThrow('Missing event');
    result.current.retry();
    await result.current.discard();
  });

  it('queues actions while offline', async () => {
    online(false);
    const mutation = vi.spyOn(client, 'mutation');
    const { result } = renderHook(() => useOfflineIntake(EVENT));
    expect(result.current.offline).toBe(true);

    await act(() => result.current.run(accept, 'Ski'));
    expect(result.current.pending).toBe(1);
    expect(mutation).not.toHaveBeenCalled();
  });

  it('replays the waiting actions once online and tells what was done', async () => {
    await queued('Ski');
    await queued('Helm');
    online(false);
    const mutation = takeAll();
    const onReplayed = vi.fn();
    const { result, rerender } = renderHook(() => useOfflineIntake(EVENT, onReplayed));
    await waitFor(() => expect(result.current.pending).toBe(2));
    expect(mutation).not.toHaveBeenCalled();

    online(true);
    rerender();
    await waitFor(() => expect(result.current.pending).toBe(0));
    expect(onReplayed).toHaveBeenCalledWith({ done: 2, refused: 0 });
    expect(await loadQueue(EVENT)).toEqual([]);
  });

  it('only hears replays of its own event', async () => {
    await queued('Ski');
    online(false);
    takeAll();
    const onReplayed = vi.fn();
    const { unmount } = renderHook(() => useOfflineIntake('other', onReplayed));
    const { result, rerender } = renderHook(() => useOfflineIntake(EVENT));
    online(true);
    rerender();
    await waitFor(() => expect(result.current.pending).toBe(0));
    expect(onReplayed).not.toHaveBeenCalled();
    unmount();
  });

  it('retries while the backend does not answer', async () => {
    await queued('Ski');
    vi.useFakeTimers();
    const mutation = vi
      .spyOn(client, 'mutation')
      .mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useOfflineIntake(EVENT));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.pending).toBe(1);
    const tries = mutation.mock.calls.length;
    expect(tries).toBeGreaterThan(0);

    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(mutation.mock.calls.length).toBeGreaterThan(tries);
    expect(result.current.pending).toBe(1);
  });

  it('waits for the team after a refusal of the whole replay, then retries or discards', async () => {
    await queued('Ski');
    const mutation = vi
      .spyOn(client, 'mutation')
      .mockRejectedValue(new ApiError(403, { code: 'event.notInTeam', message: 'Nicht im Team' }));
    const { result } = renderHook(() => useOfflineIntake(EVENT));
    await waitFor(() => expect(result.current.refusedWith).toBeDefined());
    expect(result.current.pending).toBe(1);
    const tries = mutation.mock.calls.length;

    // Once more, e.g. after being added to the team again
    act(() => result.current.retry());
    await waitFor(() => expect(mutation.mock.calls.length).toBeGreaterThan(tries));
    await waitFor(() => expect(result.current.refusedWith).toBeDefined());

    await act(() => result.current.discard());
    expect(result.current.pending).toBe(0);
    expect(result.current.refusedWith).toBeUndefined();
    expect(await loadQueue(EVENT)).toEqual([]);
  });
});
