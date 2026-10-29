import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiClient, ApiError, RETRY } from './client';
import { api } from './functions';
import { memoryQueries } from './persistedQueries';

/** One socket the test can push messages through. */
class FakeSocket {
  static last: FakeSocket | null = null;
  static OPEN = 1;
  readyState = 0;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  readonly url: string;
  constructor(url: string) {
    this.url = url;
    FakeSocket.last = this;
  }
  send(text: string) {
    this.sent.push(JSON.parse(text));
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  push(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

type Handler = (
  args: Record<string, unknown>,
  headers: Record<string, string>
) => { status?: number; body: unknown };
let handlers: Record<string, Handler>;
let calls: string[];

function respond(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  calls = [];
  handlers = {
    '/api/auth/session': () => ({ body: { userId: null } }),
  };
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const path = new URL(url, 'http://app.test').pathname;
      calls.push(path);
      const handler = handlers[path];
      if (!handler) return respond(404, { code: 'FUNCTION_NOT_FOUND', message: path });
      const body = typeof init?.body === 'string' ? init.body : '{}';
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const { status = 200, body: reply } = handler(JSON.parse(body), headers);
      return respond(status, reply);
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ApiClient', () => {
  test('a watched query loads, follows its topics and refetches when one changes', async () => {
    vi.useFakeTimers();
    let title = 'Frühjahrsbasar';
    handlers['/api/query/events.get'] = (args) => ({
      body: { value: { _id: args.id, title }, topics: [`event:${String(args.id)}`] },
    });
    const client = new ApiClient();
    client.start();
    FakeSocket.last!.open();

    const listener = vi.fn();
    client.watch(api.events.get, { id: 'e1' }, listener);
    expect(client.snapshot(api.events.get, { id: 'e1' }).loaded).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(client.snapshot(api.events.get, { id: 'e1' }).value).toEqual({
      _id: 'e1',
      title: 'Frühjahrsbasar',
    });
    expect(FakeSocket.last!.sent).toContainEqual({ type: 'subscribe', topics: ['event:e1'] });

    title = 'Herbstbasar';
    FakeSocket.last!.push({ type: 'invalidate', topics: ['event:e1'] });
    await vi.advanceTimersByTimeAsync(1000);
    expect(client.snapshot(api.events.get, { id: 'e1' }).value).toMatchObject({
      title: 'Herbstbasar',
    });
    expect(listener).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  test('changes of others are bundled: a query loads at most once a second', async () => {
    vi.useFakeTimers();
    let sold = 0;
    handlers['/api/query/eventProducts.getProductsForEvent'] = () => ({
      body: { value: sold, topics: ['event:e1'] },
    });
    const client = new ApiClient();
    client.start();
    FakeSocket.last!.open();
    client.watch(api.eventProducts.getProductsForEvent, { eventId: 'e1' }, () => {});
    await vi.advanceTimersByTimeAsync(0);
    const loads = () => calls.filter((path) => path.endsWith('getProductsForEvent')).length;
    expect(loads()).toBe(1);

    // Five sales at the cash desks within half a second
    for (let i = 0; i < 5; i++) {
      sold += 1;
      FakeSocket.last!.push({ type: 'invalidate', topics: ['event:e1'] });
      await vi.advanceTimersByTimeAsync(100);
    }
    await vi.advanceTimersByTimeAsync(1000);
    expect(loads()).toBe(2);
    expect(client.snapshot(api.eventProducts.getProductsForEvent, { eventId: 'e1' }).value).toBe(5);

    // Unrelated topics load nothing
    FakeSocket.last!.push({ type: 'invalidate', topics: ['event:e2'] });
    await vi.advanceTimersByTimeAsync(2000);
    expect(loads()).toBe(2);
    vi.useRealTimers();
  });

  test('an unchanged answer keeps its object, so components do not render again', async () => {
    handlers['/api/query/categories.getAllCategories'] = () => ({
      body: { value: [{ name: 'Kleidung' }], topics: ['table:categories'] },
    });
    const client = new ApiClient();
    client.watch(api.categories.getAllCategories, {}, () => {});
    await settle();
    const first = client.snapshot(api.categories.getAllCategories, {});
    FakeSocket.last?.push({ type: 'resync' });
    await (client as unknown as { refetchAll(): Promise<void> }).refetchAll();
    expect(client.snapshot(api.categories.getAllCategories, {})).toBe(first);
  });

  test('a mutation resolves after the queries it changed were refetched', async () => {
    let sold = false;
    handlers['/api/query/products.getProduct'] = () => ({
      body: { value: { sold }, topics: ['product:p1'] },
    });
    handlers['/api/mutation/products.updateProduct'] = () => {
      sold = true;
      return { body: { value: null, topics: ['product:p1'] } };
    };
    const client = new ApiClient();
    client.watch(api.products.getProduct, { productId: 'p1' }, () => {});
    await settle();

    await client.mutation(api.products.updateProduct, { productId: 'p1' } as never);
    expect(client.snapshot(api.products.getProduct, { productId: 'p1' }).value).toEqual({
      sold: true,
    });
  });

  test('a mutation resolves while other changes keep invalidating its queries', async () => {
    let count = 0;
    handlers['/api/query/events.get'] = () => ({ body: { value: count, topics: ['events'] } });
    handlers['/api/mutation/events.createEvent'] = () => {
      count += 1;
      return { body: { value: 'e1', topics: ['events'] } };
    };
    const client = new ApiClient();
    client.start();
    const socket = FakeSocket.last!;
    socket.open();
    client.watch(api.events.get, {}, () => {});
    await settle();
    // Other users change events all the time
    const busy = setInterval(() => socket.push({ type: 'invalidate', topics: ['events'] }), 1);
    const created = await client.mutation(api.events.createEvent, {} as never);
    clearInterval(busy);
    expect(created).toBe('e1');
    expect(client.snapshot(api.events.get, {}).value).toBe(1);
  });

  test('an optimistic value shows until the mutation is done', async () => {
    let prefs = { sales: true };
    let finish: () => void = () => {};
    handlers['/api/query/notifications.getMyNotificationPrefs'] = () => ({
      body: { value: prefs, topics: ['user:u1'] },
    });
    const client = new ApiClient();
    const query = api.notifications.getMyNotificationPrefs;
    client.watch(query, {}, () => {});
    await settle();

    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => {
            prefs = { sales: false };
            resolve(new Response(JSON.stringify({ value: null, topics: ['user:u1'] })));
          };
        })
    );
    const done = client.runMutation(
      api.notifications.updateMyNotificationPrefs,
      { prefs: { sales: false } },
      (store) => store.setQuery(query, {}, { sales: false })
    );
    expect(client.snapshot(query, {}).value).toEqual({ sales: false });
    finish();
    await done;
    expect(client.snapshot(query, {}).value).toEqual({ sales: false });
  });

  test('a server error is retried instead of breaking the page', async () => {
    vi.useFakeTimers();
    let failures = 1;
    handlers['/api/query/events.get'] = () =>
      failures-- > 0
        ? { status: 500, body: { code: 'internal', message: 'Interner Fehler' } }
        : { body: { value: [], topics: ['events'] } };
    const client = new ApiClient();
    client.watch(api.events.get, {}, () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(client.snapshot(api.events.get, {}).loaded).toBe(false);
    await vi.advanceTimersByTimeAsync(600);
    expect(client.snapshot(api.events.get, {})).toEqual({ loaded: true, value: [] });
    vi.useRealTimers();
  });

  test('a query the server never answers is given up and retried', async () => {
    vi.useFakeTimers();
    let hang = true;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        if (!hang) return respond(200, { value: [], topics: ['events'] });
        hang = false;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      })
    );
    const client = new ApiClient();
    client.watch(api.events.get, {}, () => {});
    await vi.advanceTimersByTimeAsync(20_000);
    expect(client.snapshot(api.events.get, {}).loaded).toBe(false);
    await vi.advanceTimersByTimeAsync(600);
    expect(client.snapshot(api.events.get, {})).toEqual({ loaded: true, value: [] });
    vi.useRealTimers();
  });

  test('a failed query loads again on retry', async () => {
    let allowed = false;
    handlers['/api/query/events.get'] = () =>
      allowed
        ? { body: { value: [], topics: ['events'] } }
        : { status: 403, body: { code: 'auth.forbidden', message: 'Keine Berechtigung' } };
    const client = new ApiClient();
    client.watch(api.events.get, {}, () => {});
    await settle();
    expect(client.snapshot(api.events.get, {}).error).toBeInstanceOf(ApiError);

    allowed = true;
    client.retryFailed();
    expect(client.snapshot(api.events.get, {}).loaded).toBe(false);
    await settle();
    expect(client.snapshot(api.events.get, {})).toEqual({ loaded: true, value: [] });
  });

  test('errors carry the code, values and the German text', async () => {
    handlers['/api/mutation/purchases.sellProduct'] = () => ({
      status: 400,
      body: { code: 'checkout.tooMany', params: { max: 50 }, message: 'Höchstens 50 Artikel.' },
    });
    const client = new ApiClient();
    const error = await client
      .runMutation(api.purchases.sellProduct as never, {})
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('checkout.tooMany');
    expect((error as ApiError).data.params).toEqual({ max: 50 });
    expect((error as ApiError).message).toBe('Höchstens 50 Artikel.');
  });

  test('signing in reloads the session and reopens the socket for the user topics', async () => {
    handlers['/api/auth/password'] = () => ({ body: { signingIn: true } });
    const client = new ApiClient();
    client.start();
    const first = FakeSocket.last!;
    first.open();
    await settle();
    expect(client.getAuth()).toEqual({ isLoading: false, userId: null });

    handlers['/api/auth/session'] = () => ({ body: { userId: 'u1' } });
    await client.signIn('password', { flow: 'signIn', email: 'a@b.de', password: 'x' });
    expect(client.getAuth().userId).toBe('u1');
    expect(FakeSocket.last).not.toBe(first);
  });

  test('one-off queries, and errors from pages that are not JSON', async () => {
    handlers['/api/query/instance.getConfig'] = () => ({
      body: { value: { brand: 'Basar' }, topics: [] },
    });
    const client = new ApiClient('http://backend.test/');
    expect(await client.query(api.instance.getConfig)).toEqual({ brand: 'Basar' });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('<html>Bad Gateway</html>', { status: 502 })
    );
    const error = (await client
      .query(api.instance.getConfig)
      .catch((err: unknown) => err)) as ApiError;
    expect(error.code).toBe('internal');
    expect(error.message).toBe('HTTP 502');
    expect(client.isConnected()).toBe(false);
  });

  test('a query nobody watches any more is dropped after a while and unfollowed', async () => {
    vi.useFakeTimers();
    handlers['/api/query/events.get'] = () => ({ body: { value: [], topics: ['events'] } });
    const client = new ApiClient();
    client.start();
    FakeSocket.last!.open();
    const stop = client.watch(api.events.get, {}, () => {});
    await vi.advanceTimersByTimeAsync(0);
    stop();
    // Watched again in time: kept
    const stopAgain = client.watch(api.events.get, {}, () => {});
    stopAgain();
    await vi.advanceTimersByTimeAsync(31_000);
    expect(client.snapshot(api.events.get, {}).loaded).toBe(false);
    expect(FakeSocket.last!.sent).toContainEqual({ type: 'unsubscribe', topics: ['events'] });
    vi.useRealTimers();
  });

  test('a lost connection reconnects and reloads what changed meanwhile', async () => {
    vi.useFakeTimers();
    let title = 'alt';
    handlers['/api/query/events.get'] = () => ({ body: { value: title, topics: ['events'] } });
    const client = new ApiClient();
    client.start();
    const first = FakeSocket.last!;
    first.open();
    client.watch(api.events.get, {}, () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(client.isConnected()).toBe(true);

    first.close();
    expect(client.isConnected()).toBe(false);
    title = 'neu';
    await vi.advanceTimersByTimeAsync(1000);
    const second = FakeSocket.last!;
    expect(second).not.toBe(first);
    second.open();
    second.onmessage?.({ data: 'not json' });
    await vi.advanceTimersByTimeAsync(0);
    expect(client.snapshot(api.events.get, {}).value).toBe('neu');
    vi.useRealTimers();
  });

  test('signing out tells the listeners; OAuth leaves the page for the provider', async () => {
    handlers['/api/auth/session'] = () => ({ body: { userId: 'u1' } });
    handlers['/api/auth/signout'] = () => ({ body: null });
    const client = new ApiClient();
    await client.refreshSession();
    const listener = vi.fn();
    const stop = client.onAuthChange(listener);
    await client.signOut();
    expect(client.getAuth()).toEqual({ isLoading: false, userId: null });
    expect(listener).toHaveBeenCalled();
    stop();

    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, origin: 'http://app.test', assign });
    const result = await client.signIn('github', { redirectTo: '/my-events' });
    expect(result.signingIn).toBe(false);
    expect(assign).toHaveBeenCalledWith(
      'http://app.test/api/auth/oauth/github?redirectTo=%2Fmy-events'
    );

    await client.signIn('google');
    expect(assign).toHaveBeenLastCalledWith('http://app.test/api/auth/oauth/google');

    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('offline'));
    await client.refreshSession();
    expect(client.getAuth().userId).toBeNull();
  });

  test('a failed optimistic update shows the stored value again', async () => {
    handlers['/api/query/notifications.getMyNotificationPrefs'] = () => ({
      body: { value: { sales: true }, topics: ['user:u1'] },
    });
    handlers['/api/mutation/notifications.updateMyNotificationPrefs'] = () => ({
      status: 400,
      body: { code: 'auth.required', message: 'Bitte anmelden' },
    });
    const client = new ApiClient();
    const query = api.notifications.getMyNotificationPrefs;
    client.watch(query, {}, () => {});
    await settle();
    await client
      .runMutation(api.notifications.updateMyNotificationPrefs, {}, (store) => {
        expect(store.getQuery(query, {})).toEqual({ sales: true });
        store.setQuery(api.events.get, {}, []); // not watched: ignored
        store.setQuery(query, {}, { sales: false });
      })
      .catch(() => {});
    expect(client.snapshot(query, {}).value).toEqual({ sales: true });
  });

  test('uploads return the storage id and fail with the error code', async () => {
    let sent: Record<string, string> = {};
    handlers['/api/files'] = (_, headers) => {
      sent = headers;
      return { body: { storageId: 's1' } };
    };
    const client = new ApiClient();
    const file = new Blob(['png'], { type: 'image/png' });
    expect(await client.upload('https://bazarpro.test/api/files', file)).toBe('s1');
    expect(sent).toEqual({ 'Content-Type': 'image/png' });

    handlers['/api/files'] = () => ({ status: 401, body: { code: 'auth.required', message: '' } });
    await expect(client.upload('/api/files', file)).rejects.toMatchObject({
      code: 'auth.required',
    });
  });

  describe('in the mobile app', () => {
    function appClient(token: string | null = null) {
      const store = {
        token,
        opened: [] as string[],
        getToken: () => store.token,
        setToken: (value: string | null) => void (store.token = value),
        openExternal: (url: string) => void store.opened.push(url),
      };
      return { client: new ApiClient('https://verein.example/', store), store };
    }

    test('sends the token instead of the cookie, also on the socket', async () => {
      const seen: Record<string, string>[] = [];
      handlers['/api/auth/session'] = (_, headers) => {
        seen.push(headers);
        return { body: { userId: headers.Authorization ? 'u1' : null } };
      };
      const { client } = appClient('t0k3n');
      client.start();
      await settle();
      expect(client.getAuth()).toEqual({ isLoading: false, userId: 'u1' });
      expect(seen[0]).toMatchObject({ Authorization: 'Bearer t0k3n', 'X-BazarPro-Client': 'app' });

      const socket = FakeSocket.last!;
      expect(socket.url).toBe('wss://verein.example/api/ws');
      socket.open();
      expect(socket.sent[0]).toEqual({ type: 'auth', token: 't0k3n' });
    });

    test('uploads carry the token', async () => {
      let sent: Record<string, string> = {};
      handlers['/api/files'] = (_, headers) => {
        sent = headers;
        return { body: { storageId: 's1' } };
      };
      const { client } = appClient('t0k3n');
      await client.upload('https://verein.example/api/files', new Blob([], { type: 'image/jpeg' }));
      expect(sent).toMatchObject({ Authorization: 'Bearer t0k3n', 'Content-Type': 'image/jpeg' });
    });

    test('a sign-in that first sends a code keeps no token', async () => {
      handlers['/api/auth/password'] = () => ({ body: { signingIn: false } });
      const { client, store } = appClient();
      expect(await client.signIn('password', { flow: 'signUp' })).toEqual({ signingIn: false });
      expect(store.token).toBeNull();
      expect(calls).not.toContain('/api/auth/session');
    });

    test('keeps the token of a password sign-in and drops it on sign-out', async () => {
      handlers['/api/auth/password'] = () => ({ body: { signingIn: true, token: 'neu' } });
      handlers['/api/auth/signout'] = () => ({ body: null });
      const { client, store } = appClient();
      const result = await client.signIn('password', { flow: 'signIn' });
      expect(result).toEqual({ signingIn: true });
      expect(store.token).toBe('neu');
      await client.signOut();
      expect(store.token).toBeNull();
    });

    test('OAuth opens the system browser and trades the deep-link code with the verifier', async () => {
      let exchanged: Record<string, unknown> = {};
      handlers['/api/auth/app-exchange'] = (args) => {
        exchanged = args;
        return { body: { token: 'oauth-token' } };
      };
      const { client, store } = appClient();
      await client.signIn('google');
      const opened = new URL(store.opened[0]);
      expect(opened.origin + opened.pathname).toBe('https://verein.example/api/auth/oauth/google');
      await client.completeAppSignIn('c0de');
      const verifier = String(exchanged.verifier);
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
      const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      expect(opened.searchParams.get('challenge')).toBe(challenge);
      expect(exchanged.code).toBe('c0de');
      expect(store.token).toBe('oauth-token');
      // The verifier works once
      await expect(client.completeAppSignIn('c0de')).rejects.toThrow(ApiError);
    });
  });

  describe('connection check', () => {
    afterEach(() => vi.useRealTimers());

    test('a socket whose server stops answering counts as gone', async () => {
      vi.useFakeTimers();
      const client = new ApiClient();
      const changes: boolean[] = [];
      client.onConnectionChange(() => changes.push(client.isConnected()));
      client.start();
      const socket = FakeSocket.last!;
      socket.open();
      expect(client.isConnected()).toBe(true);

      await vi.advanceTimersByTimeAsync(5000);
      expect(socket.sent).toContainEqual({ type: 'ping' });
      socket.push({ type: 'pong' });
      // No answer any more, the socket stays open without notice
      await vi.advanceTimersByTimeAsync(15_000);
      expect(client.isConnected()).toBe(false);
      expect(changes).toEqual([true, false]);
      // It tries again
      await vi.advanceTimersByTimeAsync(1000);
      expect(FakeSocket.last).not.toBe(socket);
    });

    test('a server without pings is not cut off', async () => {
      vi.useFakeTimers();
      const client = new ApiClient();
      client.start();
      FakeSocket.last!.open();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(client.isConnected()).toBe(true);
    });

    test('the device going offline drops the socket at once, online connects again', async () => {
      vi.useFakeTimers();
      const client = new ApiClient();
      client.start();
      const socket = FakeSocket.last!;
      socket.open();
      window.dispatchEvent(new Event('offline'));
      expect(client.isConnected()).toBe(false);
      window.dispatchEvent(new Event('online'));
      expect(FakeSocket.last).not.toBe(socket);
      FakeSocket.last!.open();
      expect(client.isConnected()).toBe(true);
    });
  });

  describe('answers kept on the device', () => {
    afterEach(() => vi.useRealTimers());

    test('show at once and stay when the backend cannot be reached', async () => {
      vi.useFakeTimers();
      const store = memoryQueries();
      store.claim('u1');
      store.put('events.get:{"id":"e1"}', { title: 'Vom Gerät' });
      handlers['/api/auth/session'] = () => ({ body: { userId: 'u1' } });
      const offline = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
      const client = new ApiClient();
      client.setPersistence(store);
      vi.stubGlobal('fetch', offline);
      client.watch(api.events.get, { id: 'e1' }, () => {});
      expect(client.snapshot(api.events.get, { id: 'e1' }).value).toEqual({ title: 'Vom Gerät' });
      await vi.advanceTimersByTimeAsync(60_000);
      // Retried without success: still the last state, no error
      expect(client.snapshot(api.events.get, { id: 'e1' })).toEqual({
        loaded: true,
        value: { title: 'Vom Gerät' },
      });
    });

    test('are replaced by the answer of the backend and kept again', async () => {
      const store = memoryQueries();
      store.claim('u1');
      store.put('events.get:{"id":"e1"}', { title: 'Alt' });
      handlers['/api/query/events.get'] = () => ({ body: { value: { title: 'Neu' }, topics: [] } });
      const client = new ApiClient();
      client.setPersistence(store);
      client.watch(api.events.get, { id: 'e1' }, () => {});
      await vi.waitFor(() =>
        expect(client.snapshot(api.events.get, { id: 'e1' }).value).toEqual({ title: 'Neu' })
      );
      expect(store.get('events.get:{"id":"e1"}')?.value).toEqual({ title: 'Neu' });
    });

    test('belong to one user: another sign-in starts empty, offline the last one stays', async () => {
      const store = memoryQueries();
      store.claim('u1');
      store.put('users.viewer:{}', { name: 'Ich' });

      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
      );
      const offline = new ApiClient();
      offline.setPersistence(store);
      await offline.refreshSession();
      expect(offline.getAuth().userId).toBe('u1');
      expect(store.get('users.viewer:{}')).toBeDefined();

      vi.stubGlobal('fetch', () => respond(200, { userId: 'u2' }));
      const online = new ApiClient();
      online.setPersistence(store);
      await online.refreshSession();
      expect(store.owner()).toBe('u2');
      expect(store.get('users.viewer:{}')).toBeUndefined();
    });

    test('pages taken from the device while the session loads go for another user', async () => {
      for (const session of ['u2', null]) {
        const store = memoryQueries();
        store.claim('u1');
        store.put('events.get:{"id":"e1"}', { title: 'Von u1' });
        handlers['/api/auth/session'] = () => ({ body: { userId: session } });
        // The backend has not answered the page yet
        vi.stubGlobal('fetch', (url: string) =>
          url.endsWith('/api/auth/session')
            ? respond(200, { userId: session })
            : new Promise<Response>(() => {})
        );
        const client = new ApiClient();
        client.setPersistence(store);
        client.watch(api.events.get, { id: 'e1' }, () => {});
        expect(client.snapshot(api.events.get, { id: 'e1' }).value).toEqual({ title: 'Von u1' });

        await client.refreshSession();
        expect(client.snapshot(api.events.get, { id: 'e1' })).toEqual({ loaded: false });
        expect(store.owner()).toBe(session);
      }
    });

    test('an answer not read yet is read from the device when a page asks for it', async () => {
      const kept = memoryQueries();
      kept.claim('u1');
      kept.put('events.get:{"id":"e1"}', { title: 'Vom Gerät' });
      // Like IndexedDB after the start: known, not read
      const read: string[] = [];
      const store = {
        ...kept,
        get: () => undefined,
        load: (key: string) => {
          read.push(key);
          return kept.load(key);
        },
      };
      vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
      const client = new ApiClient();
      client.setPersistence(store);
      expect(client.isOnDevice(api.events.get, { id: 'e1' })).toBe(true);
      const told = vi.fn();
      client.watch(api.events.get, { id: 'e1' }, told);
      await vi.waitFor(() =>
        expect(client.snapshot(api.events.get, { id: 'e1' }).value).toEqual({
          title: 'Vom Gerät',
        })
      );
      // The page hears of it
      expect(told).toHaveBeenCalled();
      expect(read).toEqual(['events.get:{"id":"e1"}']);
    });

    test('a batch keeps every answer as if asked one by one', async () => {
      handlers['/api/batch-query'] = (args) => {
        expect(args).toEqual({
          calls: [
            { name: 'products.getProduct', args: { productId: 'p1' } },
            { name: 'products.getProduct', args: { productId: 'p2' } },
            { name: 'products.getProduct', args: { productId: 'p3' } },
          ],
        });
        return {
          body: { results: [{ value: { title: 'Ski' }, topics: [] }, null, { retry: true }] },
        };
      };
      const store = memoryQueries();
      const client = new ApiClient();
      client.setPersistence(store);
      const answers = await client.batchQuery([
        { fn: api.products.getProduct, args: { productId: 'p1' } },
        { fn: api.products.getProduct, args: { productId: 'p2' } },
        { fn: api.products.getProduct, args: { productId: 'p3' } },
      ]);
      // Refused, or failed for now and worth asking again
      expect(answers).toEqual([{ title: 'Ski' }, undefined, RETRY]);
      expect(store.get('products.getProduct:{"productId":"p1"}')?.value).toEqual({ title: 'Ski' });
      expect(store.get('products.getProduct:{"productId":"p2"}')).toBeUndefined();
    });
  });
});
