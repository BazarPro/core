import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from './api/client';
import { api } from './api/functions';
import { memoryQueries } from './api/persistedQueries';
import {
  loadQueue,
  replayQueue,
  resetOfflineActions,
  runIntakeAction,
  type IntakeAction,
} from './offlineActions';
import { OFFLINE_FLAG_KEY } from './offlineMode';

const EVENT = 'evt1';
const LIST_KEY = `eventProducts.getProductsForEventManagement:{"eventId":"${EVENT}"}`;
const LOCATIONS_KEY = `eventLocationCategories.listForEvent:{"eventId":"${EVENT}"}`;

const accept: IntakeAction = {
  name: 'eventProducts.updateProductStatus',
  args: {
    eventProductId: 'ep1' as never,
    status: 'available',
    locationCategoryId: 'loc1' as never,
  },
};

function clientWithList() {
  const store = memoryQueries();
  store.put(LIST_KEY, [
    { eventProductId: 'ep1', vendorId: 'v1', status: 'announced', title: 'Ski' },
    { eventProductId: 'ep2', vendorId: 'v1', status: 'announced', title: 'Helm' },
    { eventProductId: 'ep3', vendorId: 'v2', status: 'announced', title: 'Rad' },
  ]);
  store.put(LOCATIONS_KEY, [{ _id: 'loc1', label: 'Halle B' }]);
  const client = new ApiClient();
  client.setPersistence(store);
  return { client, store };
}

const list = (store: ReturnType<typeof memoryQueries>) =>
  store.get(LIST_KEY)?.value as {
    eventProductId: string;
    status: string;
    locationLabel?: string;
  }[];

describe('offline intake', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(OFFLINE_FLAG_KEY, '1');
    resetOfflineActions();
    vi.unstubAllGlobals();
  });

  it('queues an action offline and shows it in the item list on the device', async () => {
    const { client, store } = clientWithList();
    const mutation = vi.spyOn(client, 'mutation');
    const result = await runIntakeAction(client, EVENT, accept, 'Ski', true);

    expect(result).toEqual({ queued: true });
    expect(mutation).not.toHaveBeenCalled();
    expect(list(store)[0]).toMatchObject({ status: 'available', locationLabel: 'Halle B' });
    expect(list(store)[1].status).toBe('announced');

    await runIntakeAction(
      client,
      EVENT,
      {
        name: 'eventProducts.markAllVendorProductsAvailable',
        args: { eventId: EVENT as never, vendorId: 'v1' as never },
      },
      'Verkäufer 1',
      true
    );
    expect(list(store).map((p) => p.status)).toEqual(['available', 'available', 'announced']);

    // Still there after a restart of the app
    resetOfflineActions();
    expect((await loadQueue(EVENT)).map((action) => action.label)).toEqual(['Ski', 'Verkäufer 1']);
  });

  it('online it runs right away; without answer it goes into the queue; refusals are thrown', async () => {
    const { client } = clientWithList();
    const mutation = vi.spyOn(client, 'mutation').mockResolvedValueOnce('ep1' as never);
    expect(await runIntakeAction(client, EVENT, accept, 'Ski', false)).toEqual({ queued: false });
    expect(mutation).toHaveBeenCalledWith(api.eventProducts.updateProductStatus, accept.args);

    mutation.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await runIntakeAction(client, EVENT, accept, 'Ski', false)).toEqual({ queued: true });

    mutation.mockRejectedValueOnce(
      new ApiError(400, { code: 'seller.paidOutUndoFirst', message: 'Ausgezahlt' })
    );
    await expect(runIntakeAction(client, EVENT, accept, 'Ski', false)).rejects.toThrow(ApiError);
    expect(await loadQueue(EVENT)).toHaveLength(1);
  });

  it('replays the queue once online and counts what the backend refused', async () => {
    const { client } = clientWithList();
    await runIntakeAction(client, EVENT, accept, 'Ski', true);
    await runIntakeAction(
      client,
      EVENT,
      {
        name: 'eventProducts.setEventProductNote',
        args: { eventProductId: 'ep1' as never, note: 'Haken 3' },
      },
      'Ski',
      true
    );
    const queued = await loadQueue(EVENT);
    const mutation = vi.spyOn(client, 'mutation').mockResolvedValueOnce([
      { id: queued[0].id, doneNow: true, error: 'seller.paidOutUndoFirst' },
      { id: queued[1].id, doneNow: true },
    ] as never);

    expect(await replayQueue(client, EVENT)).toEqual({ done: 1, refused: 1 });
    const [, args] = mutation.mock.calls[0] as [unknown, { actions: { name: string }[] }];
    expect(args.actions.map((action) => action.name)).toEqual([
      'eventProducts.updateProductStatus',
      'eventProducts.setEventProductNote',
    ]);
    expect(await loadQueue(EVENT)).toEqual([]);
  });
});
