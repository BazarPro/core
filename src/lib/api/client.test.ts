import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiClient, ApiError } from './client';
import { api } from './functions';

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

type Handler = (args: Record<string, unknown>) => { status?: number; body: unknown };
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
      const { status = 200, body } = handler(JSON.parse(String(init?.body ?? '{}')));
      return respond(status, body);
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ApiClient', () => {
  test('a watched query loads, follows its topics and refetches when one changes', async () => {
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
    await settle();
    expect(client.snapshot(api.events.get, { id: 'e1' }).value).toEqual({
      _id: 'e1',
      title: 'Frühjahrsbasar',
    });
    expect(FakeSocket.last!.sent).toContainEqual({ type: 'subscribe', topics: ['event:e1'] });

    title = 'Herbstbasar';
    FakeSocket.last!.push({ type: 'invalidate', topics: ['event:e1'] });
    await settle();
    expect(client.snapshot(api.events.get, { id: 'e1' }).value).toMatchObject({
      title: 'Herbstbasar',
    });
    expect(listener).toHaveBeenCalledTimes(2);
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
});
