import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackendUnavailableError, createBackendClient } from './backend.ts';

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createBackendClient', () => {
  it('posts the query and returns the value', async () => {
    const fetchMock = mockFetch(200, { value: { title: 'Basar' }, topics: [] });
    const client = createBackendClient('http://backend:3000/');

    await expect(client.query('events.get', { id: '1' })).resolves.toEqual({ title: 'Basar' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:3000/api/query/events.get',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ id: '1' }),
      })
    );
  });

  it('returns null when the backend rejects the query (e.g. invalid id)', async () => {
    mockFetch(400, { code: 'INVALID_ARGUMENTS', message: 'INVALID_ARGUMENTS' });
    const client = createBackendClient('http://backend:3000');
    await expect(client.query('events.get', { id: 'bad' })).resolves.toBeNull();
  });

  it('throws BackendUnavailableError on server errors and network failures', async () => {
    mockFetch(502, {});
    const client = createBackendClient('http://backend:3000');
    await expect(client.query('events.get', {})).rejects.toBeInstanceOf(BackendUnavailableError);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      })
    );
    await expect(client.query('events.get', { other: 1 })).rejects.toBeInstanceOf(
      BackendUnavailableError
    );
  });

  it('caches results until the TTL expires', async () => {
    const fetchMock = mockFetch(200, { value: 1, topics: [] });
    const client = createBackendClient('http://backend:3000', { ttlMs: 1000 });
    vi.useFakeTimers();
    try {
      await client.query('a.b', {});
      await client.query('a.b', {});
      expect(fetchMock).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1001);
      await client.query('a.b', {});
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('evicts the oldest entry when the cache is full', async () => {
    const fetchMock = mockFetch(200, { value: 1, topics: [] });
    const client = createBackendClient('http://backend:3000', { maxEntries: 1 });
    await client.query('a.first', {});
    await client.query('a.second', {});
    await client.query('a.first', {});
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
