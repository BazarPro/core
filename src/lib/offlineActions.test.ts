import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from './api/client';
import { api } from './api/functions';
import { memoryQueries } from './api/persistedQueries';
import {
  loadQueue,
  refusalOf,
  replayQueue,
  resetOfflineActions,
  runIntakeAction,
  type IntakeAction,
} from './offlineActions';
import { setDeviceOwner } from './deviceFiles';
import { OFFLINE_FLAG_KEY } from './offlineMode';

const EVENT = 'evt1';
const LIST_KEY = `eventProducts.getProductsForEventManagement:{"eventId":"${EVENT}"}`;
const LOCATIONS_KEY = `eventLocationCategories.listForEvent:{"eventId":"${EVENT}"}`;
const pageKey = (productId: string) =>
  `eventProducts.getEventProduct:{"eventId":"${EVENT}","productId":"${productId}"}`;

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
    { _id: 'p1', eventProductId: 'ep1', vendorId: 'v1', status: 'announced', title: 'Ski' },
    { _id: 'p2', eventProductId: 'ep2', vendorId: 'v1', status: 'announced', title: 'Helm' },
    { _id: 'p3', eventProductId: 'ep3', vendorId: 'v2', status: 'announced', title: 'Rad' },
  ]);
  store.put(pageKey('p1'), { _id: 'ep1', status: 'announced', internalNote: 'alt' });
  store.put(pageKey('p2'), { _id: 'ep2', status: 'announced' });
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
    // The product pages show it too
    expect(store.get(pageKey('p1'))?.value).toMatchObject({
      status: 'available',
      locationLabel: 'Halle B',
    });
    expect(store.get(pageKey('p2'))?.value).toMatchObject({ status: 'available' });

    // Still there after a restart of the app
    resetOfflineActions();
    const queued = await loadQueue(EVENT);
    expect(queued.map((action) => action.label)).toEqual(['Ski', 'Verkäufer 1']);
    // With the status the device knew, so the backend does not set back a later change
    expect(queued[0].args).toMatchObject({ status: 'available', fromStatus: 'announced' });
    // Accepting all takes only the announced items the device knew, not ones announced since
    expect(queued[1].args).toMatchObject({ seenProductIds: ['p2'] });
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
    // With the note the device knew, so an older one does not overwrite a newer one
    expect(queued[1].args).toMatchObject({ note: 'Haken 3', fromNote: '' });
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

  it('the note shows on the product page offline', async () => {
    const { client, store } = clientWithList();
    await runIntakeAction(
      client,
      EVENT,
      {
        name: 'eventProducts.setEventProductNote',
        args: { eventProductId: 'ep1' as never, note: 'Haken 12' },
      },
      'Ski',
      true
    );
    expect(store.get(pageKey('p1'))?.value).toMatchObject({ internalNote: 'Haken 12' });
  });

  it('actions queued at the same time are all kept', async () => {
    const { client } = clientWithList();
    // Before the queue is loaded from the device, both wait for the same load
    await Promise.all([
      runIntakeAction(client, EVENT, accept, 'Ski', true),
      runIntakeAction(
        client,
        EVENT,
        {
          name: 'eventProducts.setEventProductNote',
          args: { eventProductId: 'ep2' as never, note: 'Haken 3' },
        },
        'Helm',
        true
      ),
    ]);
    expect((await loadQueue(EVENT)).map((action) => action.label)).toEqual(['Ski', 'Helm']);
  });

  it('a refusal of the whole replay keeps the queue and waits for the team', async () => {
    const { client } = clientWithList();
    await runIntakeAction(client, EVENT, accept, 'Ski', true);
    const mutation = vi.spyOn(client, 'mutation');

    // No answer: may pass next time
    mutation.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(replayQueue(client, EVENT)).rejects.toThrow(TypeError);
    expect(refusalOf(EVENT)).toBeUndefined();

    // Not in the team any more: retrying alone will not help
    mutation.mockRejectedValueOnce(
      new ApiError(403, { code: 'forbidden', message: 'Kein Zugriff auf dieses Event' })
    );
    await expect(replayQueue(client, EVENT)).rejects.toThrow(ApiError);
    expect(refusalOf(EVENT)).toBeTruthy();
    expect(await loadQueue(EVENT)).toHaveLength(1);

    // Back in the team: the next replay clears it
    const [queued] = await loadQueue(EVENT);
    mutation.mockResolvedValueOnce([{ id: queued.id, doneNow: true }] as never);
    expect(await replayQueue(client, EVENT)).toEqual({ done: 1, refused: 0 });
    expect(refusalOf(EVENT)).toBeUndefined();
  });

  it('another user on the device neither sees nor replays the queue', async () => {
    const { client } = clientWithList();
    setDeviceOwner('helper-a');
    await runIntakeAction(client, EVENT, accept, 'Ski', true);
    expect(await loadQueue(EVENT)).toHaveLength(1);

    setDeviceOwner('helper-b');
    const mutation = vi.spyOn(client, 'mutation');
    expect(await loadQueue(EVENT)).toEqual([]);
    expect(await replayQueue(client, EVENT)).toEqual({ done: 0, refused: 0 });
    expect(mutation).not.toHaveBeenCalled();

    // Back to the first user: the queue is still there, sent in their name
    setDeviceOwner('helper-a');
    expect(await loadQueue(EVENT)).toHaveLength(1);
    setDeviceOwner(null);
  });

  it('an action stays with its user when another one signs in while it is written', async () => {
    const { client } = clientWithList();
    setDeviceOwner('helper-a');
    await loadQueue(EVENT);
    const queued = runIntakeAction(client, EVENT, accept, 'Ski', true);
    setDeviceOwner('helper-b');
    await queued;

    expect(await loadQueue(EVENT)).toEqual([]);
    setDeviceOwner('helper-a');
    expect((await loadQueue(EVENT)).map((action) => action.label)).toEqual(['Ski']);
    setDeviceOwner(null);
  });
});
