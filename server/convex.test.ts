import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConvexUnavailableError, createConvexClient } from './convex.ts';

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createConvexClient', () => {
  it('posts the query and returns the value', async () => {
    const fetchMock = mockFetch(200, { status: 'success', value: { title: 'Basar' } });
    const client = createConvexClient('https://convex.example/');

    await expect(client.query('events:get', { id: '1' })).resolves.toEqual({ title: 'Basar' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://convex.example/api/query',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ path: 'events:get', args: { id: '1' }, format: 'json' }),
      })
    );
  });

  it('returns null when Convex rejects the query (e.g. invalid id)', async () => {
    mockFetch(400, { status: 'error', errorMessage: 'ArgumentValidationError' });
    const client = createConvexClient('https://convex.example');
    await expect(client.query('events:get', { id: 'bad' })).resolves.toBeNull();
  });

  it('throws ConvexUnavailableError on server errors and network failures', async () => {
    mockFetch(502, {});
    const client = createConvexClient('https://convex.example');
    await expect(client.query('events:get', {})).rejects.toBeInstanceOf(ConvexUnavailableError);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      })
    );
    await expect(client.query('events:get', { other: 1 })).rejects.toBeInstanceOf(
      ConvexUnavailableError
    );
  });

  it('caches results until the TTL expires', async () => {
    const fetchMock = mockFetch(200, { status: 'success', value: 1 });
    const client = createConvexClient('https://convex.example', { ttlMs: 1000 });
    vi.useFakeTimers();
    try {
      await client.query('a:b', {});
      await client.query('a:b', {});
      expect(fetchMock).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1001);
      await client.query('a:b', {});
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('evicts the oldest entry when the cache is full', async () => {
    const fetchMock = mockFetch(200, { status: 'success', value: 1 });
    const client = createConvexClient('https://convex.example', { maxEntries: 1 });
    await client.query('a:first', {});
    await client.query('a:second', {});
    await client.query('a:first', {});
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
