import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from './api/client';
import { getFunctionName } from './api/functions';
import { memoryQueries, type PersistedQueries } from './api/persistedQueries';
import { readDeviceJson } from './deviceFiles';
import { lastPrepared, prepareEventForOffline } from './offlinePrefetch';

const EVENT = 'evt1';
const PRODUCTS = [{ _id: 'p1', acceptsOffers: true }, { _id: 'p2' }];

type Sent = { calls: { name: string; args: Record<string, unknown> }[] };

/** Kept like IndexedDB does: `stored` false is a device whose storage is full */
function deviceStore(stored = true): PersistedQueries {
  return { ...memoryQueries(), flush: () => Promise.resolve(stored) };
}

/**
 * A backend that answers every batched query; `answer` decides per function name,
 * undefined fails the query.
 */
function clientAnswering(
  answer: (name: string, args: Record<string, unknown>) => unknown,
  store: PersistedQueries = deviceStore()
) {
  const client = new ApiClient();
  client.setPersistence(store);
  const asked: string[] = [];
  const post = vi.spyOn(
    client as unknown as { post: (path: string, body: Sent) => Promise<Response> },
    'post'
  );
  post.mockImplementation(async (_path, { calls }) => {
    const results = calls.map(({ name, args }) => {
      asked.push(name);
      const value = answer(name, args);
      return value === undefined ? null : { value };
    });
    return new Response(JSON.stringify({ results }));
  });
  const batchQuery = vi.spyOn(client, 'batchQuery');
  vi.spyOn(client, 'query').mockResolvedValue({ items: [] } as never);
  vi.spyOn(client, 'mutation').mockResolvedValue([{ userId: 'u1', secret: 'c2VjcmV0' }] as never);
  return { client, asked, batchQuery };
}

function bazaar(name: string, args: Record<string, unknown>): unknown {
  switch (name) {
    case 'eventProducts.getProductsForEventManagement':
      return PRODUCTS;
    case 'products.getProduct':
      return { images: args.productId === 'p1' ? ['img1'] : [] };
    case 'eventProducts.getEventIdsForProduct':
      return [EVENT];
    default:
      return null;
  }
}

describe('preparing a bazaar for offline use', () => {
  beforeEach(() => localStorage.clear());

  it('loads the organizer pages, every product page and what they name', async () => {
    const { client, asked } = clientAnswering(bazaar);
    const result = await prepareEventForOffline(client, EVENT);

    expect(result.products).toBe(2);
    expect(lastPrepared(client, EVENT)).toEqual(result);
    // Offers only for the item that takes them
    expect(asked.filter((name) => name === 'offers.getOffersForStaff')).toHaveLength(1);
    // Photos of the item that has some; the same list of events once
    expect(asked.filter((name) => name === 'products.getImageUrls')).toHaveLength(1);
    expect(asked.filter((name) => name === 'events.getEvents')).toHaveLength(1);
    // The cash desk's copy and the keys of the sellers' IDs
    expect(client.query).toHaveBeenCalled();
    expect(await readDeviceJson(`check-in/event-${EVENT}`)).toEqual([
      { userId: 'u1', secret: 'c2VjcmV0' },
    ]);
  });

  it('asks once more for what failed', async () => {
    let failures = 1;
    const { client, batchQuery } = clientAnswering((name, args) => {
      if (name === 'products.getProduct' && failures > 0) {
        failures -= 1;
        return undefined;
      }
      return bazaar(name, args);
    });
    expect((await prepareEventForOffline(client, EVENT)).products).toBe(2);
    const retried = batchQuery.mock.calls.find(([calls]) => calls.length === 1)?.[0];
    expect(retried?.map(({ fn }) => getFunctionName(fn))).toEqual(['products.getProduct']);
  });

  it('is not ready without the item list', async () => {
    const { client } = clientAnswering((name, args) =>
      name === 'eventProducts.getProductsForEventManagement' ? undefined : bazaar(name, args)
    );
    await expect(prepareEventForOffline(client, EVENT)).rejects.toThrow(/missing/);
    expect(lastPrepared(client, EVENT)).toBeNull();
  });

  it('is not ready while a product page is missing', async () => {
    const { client } = clientAnswering((name, args) =>
      name === 'productQuestions.listForProduct' && args.productId === 'p2'
        ? undefined
        : bazaar(name, args)
    );
    await expect(prepareEventForOffline(client, EVENT)).rejects.toThrow(/1 answers/);
    expect(lastPrepared(client, EVENT)).toBeNull();
  });

  it('is not ready when the device cannot store the copy', async () => {
    const { client } = clientAnswering(bazaar, deviceStore(false));
    await expect(prepareEventForOffline(client, EVENT)).rejects.toThrow(/stored/);
    expect(lastPrepared(client, EVENT)).toBeNull();
  });

  it('is no longer ready once the item list is gone from the device', async () => {
    const store = deviceStore();
    const { client } = clientAnswering(bazaar, store);
    await prepareEventForOffline(client, EVENT);
    expect(lastPrepared(client, EVENT)).not.toBeNull();

    // Another user signed in: the answers on the device are dropped
    store.claim('someone-else');
    expect(lastPrepared(client, EVENT)).toBeNull();
  });
});
