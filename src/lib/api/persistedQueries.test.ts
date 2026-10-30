import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryQueries, openPersistedQueries } from './persistedQueries';

/** Lets the fake IndexedDB run its requests */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  // Every test on an empty device
  globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('memoryQueries', () => {
  it('keeps answers until another user claims them', async () => {
    const q = memoryQueries();
    q.put('a', 1);
    expect(q.has('a')).toBe(true);
    expect(q.get('a')?.value).toBe(1);
    expect((await q.load('a'))?.value).toBe(1);

    q.claim(null);
    expect(q.has('a')).toBe(true);

    q.claim('u1');
    expect(q.owner()).toBe('u1');
    expect(q.has('a')).toBe(false);
    expect(await q.flush()).toBe(false);
  });
});

describe('openPersistedQueries', () => {
  it('works in memory when IndexedDB cannot be opened', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const q = await openPersistedQueries();
    q.put('a', 1);
    expect(q.get('a')?.value).toBe(1);
    expect(await q.flush()).toBe(false);
  });

  it('keeps the answers for the next start and reads them only when asked', async () => {
    const first = await openPersistedQueries();
    first.put('a', { n: 1 });
    expect(await first.flush()).toBe(true);

    const q = await openPersistedQueries();
    expect(q.has('a')).toBe(true);
    expect(q.get('a')).toBeUndefined();
    expect((await q.load('a'))?.value).toEqual({ n: 1 });
    // Now in memory
    expect(q.get('a')?.value).toEqual({ n: 1 });
    expect((await q.load('a'))?.value).toEqual({ n: 1 });
  });

  it('answers undefined for an answer the device does not keep', async () => {
    const q = await openPersistedQueries();
    expect(q.has('missing')).toBe(false);
    expect(await q.load('missing')).toBeUndefined();
  });

  it('reads an answer once for several who ask at the same time', async () => {
    const first = await openPersistedQueries();
    first.put('a', 1);
    await first.flush();

    const q = await openPersistedQueries();
    const one = q.load('a');
    expect(q.load('a')).toBe(one);
    expect((await one)?.value).toBe(1);
  });

  it('prefers an answer put while the stored one is read', async () => {
    const first = await openPersistedQueries();
    first.put('a', 'old');
    await first.flush();

    const q = await openPersistedQueries();
    const reading = q.load('a');
    q.put('a', 'new');
    expect((await reading)?.value).toBe('new');
  });

  it('flushes with nothing pending', async () => {
    const q = await openPersistedQueries();
    expect(await q.flush()).toBe(true);
  });

  it('keeps the owner and forgets the answers of another user', async () => {
    const first = await openPersistedQueries();
    expect(first.owner()).toBeNull();
    first.claim('u1');
    first.put('a', 1);
    // The same user again changes nothing
    first.claim('u1');
    expect(first.get('a')?.value).toBe(1);
    expect(await first.flush()).toBe(true);

    const second = await openPersistedQueries();
    expect(second.owner()).toBe('u1');
    expect(second.has('a')).toBe(true);
    second.claim('u2');
    expect(second.has('a')).toBe(false);
    expect(await second.flush()).toBe(true);

    const third = await openPersistedQueries();
    expect(third.owner()).toBe('u2');
    expect(third.has('a')).toBe(false);
  });

  it('drops a read started before another user signed in', async () => {
    const first = await openPersistedQueries();
    first.put('a', 1);
    await first.flush();

    const q = await openPersistedQueries();
    const reading = q.load('a');
    q.claim('u2');
    expect(await reading).toBeUndefined();
    expect(q.get('a')).toBeUndefined();
  });

  it('answers undefined when the device cannot be read', async () => {
    const first = await openPersistedQueries();
    first.put('a', 1);
    await first.flush();

    const q = await openPersistedQueries();
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(() => {
      throw new Error('gone');
    });
    expect(await q.load('a')).toBeUndefined();
  });

  it('starts empty when the stored answers cannot be read', async () => {
    const first = await openPersistedQueries();
    first.claim('u1');
    first.put('a', 1);
    await first.flush();

    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementationOnce(() => {
      throw new Error('unreadable');
    });
    const q = await openPersistedQueries();
    expect(q.owner()).toBeNull();
    expect(q.has('a')).toBe(false);
  });

  it('reports answers that could not be written until a later write succeeds', async () => {
    const q = await openPersistedQueries();
    const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction');
    transaction.mockImplementationOnce(() => {
      throw new Error('full');
    });
    q.put('a', 1);
    expect(await q.flush()).toBe(false);
    // Still in memory
    expect(q.get('a')?.value).toBe(1);

    q.put('a', 2);
    expect(await q.flush()).toBe(true);
  });

  it('reports a write the device aborts', async () => {
    const q = await openPersistedQueries();
    const original = IDBDatabase.prototype.transaction;
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (
      this: IDBDatabase,
      ...args: Parameters<IDBDatabase['transaction']>
    ) {
      const tx = original.apply(this, args);
      if (args[1] === 'readwrite') queueMicrotask(() => tx.abort());
      return tx;
    });
    q.put('a', 1);
    expect(await q.flush()).toBe(false);
  });

  it('writes the pending answers when the app goes to the background', async () => {
    const q = await openPersistedQueries();
    // On the device well before the collected write would store it (WRITE_DELAY_MS): the
    // event wrote it. Waited for, as the second write waits for the first one
    const stored = (key: string) =>
      vi.waitFor(async () => expect((await openPersistedQueries()).has(key)).toBe(true), {
        timeout: 500,
      });

    q.put('a', 1);
    window.dispatchEvent(new Event('pagehide'));
    await stored('a');

    q.put('b', 2);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await stored('b');
  });

  it('drops the oldest answers beyond the limit', async () => {
    // Every answer stored a moment after the one before
    let now = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => (now += 1));
    const first = await openPersistedQueries(100);
    for (let i = 0; i <= 100; i += 1) first.put(`old${i}`, i);
    await first.flush();

    const q = await openPersistedQueries(100);
    // Beyond the limit by a tenth: the oldest go
    for (let i = 0; i < 10; i += 1) q.put(`new${i}`, i);
    await vi.waitFor(() => expect(q.has('old0')).toBe(false));
    expect(q.has('old10')).toBe(false);
    expect(q.has('old11')).toBe(true);
    expect(q.has('new0')).toBe(true);
    await q.flush();

    const next = await openPersistedQueries(100);
    expect(next.has('old0')).toBe(false);
    expect(next.has('old11')).toBe(true);
    expect(next.has('new9')).toBe(true);
  });

  it('drops nothing when another user signs in while the oldest are looked for', async () => {
    const first = await openPersistedQueries(10);
    for (let i = 0; i <= 10; i += 1) first.put(`old${i}`, i);
    await first.flush();

    const q = await openPersistedQueries(10);
    q.put('new', 1);
    q.claim('u2');
    q.put('mine', 1);
    await q.flush();
    expect(q.has('mine')).toBe(true);
    expect(q.owner()).toBe('u2');
  });

  it('tries again later when the oldest cannot be looked for', async () => {
    const first = await openPersistedQueries(10);
    for (let i = 0; i <= 10; i += 1) first.put(`old${i}`, i);
    await first.flush();

    const q = await openPersistedQueries(10);
    vi.spyOn(IDBObjectStore.prototype, 'index').mockImplementationOnce(() => {
      throw new Error('gone');
    });
    q.put('new', 1);
    await settle();
    expect(q.has('old0')).toBe(true);

    // The next answer put tries again
    q.put('newer', 1);
    await vi.waitFor(() => expect(q.has('old0')).toBe(false));
  });

  it('does not write while the app stays visible', async () => {
    const q = await openPersistedQueries();
    q.put('a', 1);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect((await openPersistedQueries()).has('a')).toBe(false);
    await q.flush();
  });
});
