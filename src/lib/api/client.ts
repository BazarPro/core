import type { FunctionReference, FunctionReturnType, Id, OptionalRestArgs } from './types';
import { getFunctionName } from './functions';
import type { PersistedQueries } from './persistedQueries';
import { removeDeviceFiles, setDeviceOwner } from '../deviceFiles';

/**
 * Talks to the Rust backend (backend/): queries and mutations over HTTP, live updates
 * over one WebSocket.
 *
 * Every query answer names the topics it read (`event:<id>`, `user:<id>`, …). The client
 * follows them on the WebSocket and refetches a query when the backend reports one of its
 * topics as changed. A mutation answers with the topics it changed, and the client
 * refetches the affected queries before the call resolves, so the UI shows the change
 * right after `await`. Changes of others arrive spread out and bundled: on a bazaar day
 * every sale changes the item list, and all open pages would otherwise load it at once.
 */

export type ErrorParams = Record<string, string | number>;

export type ApiErrorData = {
  code: string;
  params?: ErrorParams;
  /** German text, for logs and codes the app does not know */
  message: string;
  /** The error of one item when a whole cart fails */
  cause?: { code: string; params?: ErrorParams };
};

/** A query of a batch that failed for now and may pass when asked again (ApiClient.batchQuery) */
export const RETRY = Symbol('retry');

export class ApiError extends Error {
  readonly status: number;
  readonly data: ApiErrorData;

  constructor(status: number, data: ApiErrorData) {
    super(data.message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }

  get code() {
    return this.data.code;
  }
}

type Listener = () => void;

export type QueryState = {
  loaded: boolean;
  value?: unknown;
  error?: unknown;
};

const EMPTY: QueryState = { loaded: false };

interface Entry {
  name: string;
  args: Record<string, unknown>;
  /** The backend's answer */
  state: QueryState;
  /** What components see: the answer or the newest optimistic value */
  view: QueryState;
  /** JSON of the last answer: unchanged answers keep their object identity */
  json?: string;
  topics: string[];
  listeners: Set<Listener>;
  fetching: boolean;
  /** Callers waiting for the next completed load */
  waiting: (() => void)[];
  /** Changed again while a fetch was running */
  again: boolean;
  /** Failed fetches in a row (network or server errors) */
  retries: number;
  /** The answer came from the device, not yet from the backend */
  fromDevice: boolean;
  /** Values of optimistic updates still running, newest last */
  optimistic: { id: number; value: unknown }[];
  evictTimer?: ReturnType<typeof setTimeout>;
  /** A load for changes reported on the socket is due */
  liveTimer?: ReturnType<typeof setTimeout>;
  /** When the last load started (ms) */
  lastLoad: number;
}

export type AuthState = { isLoading: boolean; userId: string | null };

/**
 * The mobile app runs on its own origin (Capacitor), where the session cookie does not
 * work: it signs in with a bearer token and does OAuth in the system browser.
 */
export type AppAuth = {
  /** The saved session token */
  getToken(): string | null;
  setToken(token: string | null): void;
  /** Opens the OAuth start page outside the app; it returns via deep link */
  openExternal(url: string): void | Promise<void>;
};

/** Unwatched queries stay this long, so going back to a page shows it at once */
const KEEP_UNWATCHED_MS = 30_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
/** How long reconnectNow waits for the backend before it says there is no connection */
const RECONNECT_NOW_TIMEOUT_MS = 10_000;
/**
 * The socket pings this often; without an answer for DEAD_AFTER_MS it counts as gone.
 * Without internet a quiet socket stays open for minutes, the offline desk must know now.
 */
const PING_INTERVAL_MS = 5000;
const DEAD_AFTER_MS = 12_000;
/** Retries of a query after network or server errors (0.5 s, 1 s, … 16 s) */
const MAX_RETRIES = 6;
/** A query without an answer counts as a network error, so it is retried and fails at last */
const QUERY_TIMEOUT_MS = 20_000;
/** Changes reported on the socket: each query loads at most this often … */
const LIVE_MIN_INTERVAL_MS = 1000;
/** … and after a random delay up to this, so not all pages ask in the same moment */
const LIVE_JITTER_MS = 300;
/** How long a mutation waits for the queries it changed */
const MUTATION_REFETCH_WAIT_MS = 5000;

export type OptimisticStore = {
  getQuery(fn: unknown, args?: Record<string, unknown>): unknown;
  setQuery(fn: unknown, args: Record<string, unknown> | undefined, value: unknown): void;
};

function keyOf(name: string, args: Record<string, unknown>) {
  return `${name}:${JSON.stringify(args)}`;
}

async function readError(response: Response): Promise<ApiError> {
  let body: Partial<ApiErrorData> | null = null;
  try {
    body = (await response.json()) as Partial<ApiErrorData>;
  } catch {
    // not JSON, e.g. a proxy error page
  }
  return new ApiError(response.status, {
    code: typeof body?.code === 'string' ? body.code : 'internal',
    message: typeof body?.message === 'string' ? body.message : `HTTP ${response.status}`,
    ...(body?.params ? { params: body.params } : {}),
    ...(body?.cause ? { cause: body.cause } : {}),
  });
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly entries = new Map<string, Entry>();
  private socket: WebSocket | null = null;
  /** Topics the open socket follows */
  private following = new Set<string>();
  private reconnectDelay = 1000;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private pingTimer?: ReturnType<typeof setInterval>;
  private lastMessageAt = 0;
  /** Older servers do not answer pings; their sockets are not checked */
  private serverAnswersPings = false;
  /** Answers kept on the device, see setPersistence */
  private persisted?: PersistedQueries;
  /** The session could not be checked (no connection); checked again once online */
  private sessionUnchecked = false;
  private started = false;
  private everConnected = false;
  private nextOptimisticId = 1;
  private auth: AuthState = { isLoading: true, userId: null };
  private readonly authListeners = new Set<Listener>();
  private connected = false;
  private readonly connectionListeners = new Set<Listener>();
  /** Told when a socket is gone, also one that never connected */
  private readonly droppedListeners = new Set<Listener>();
  private readonly app?: AppAuth;
  /** PKCE verifier of the OAuth sign-in the app has started */
  private oauthVerifier: string | null = null;

  /**
   * `baseUrl`: empty for the app's own origin, which forwards /api to the backend.
   * `app`: only in the mobile app, with the server as `baseUrl`.
   */
  constructor(baseUrl = '', app?: AppAuth) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.app = app;
  }

  /**
   * Cookie on the web, bearer token in the app. Another server gets no cookie: the
   * backend allows the app's origins only without credentials (backend/src/routes.rs).
   */
  private authInit(headers: Record<string, string> = {}): RequestInit {
    if (!this.app) return { headers, credentials: this.baseUrl ? 'omit' : 'include' };
    const token = this.app.getToken();
    return {
      headers: {
        ...headers,
        'X-BazarPro-Client': 'app',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
  }

  /**
   * Keeps the answers on the device: pages show the last state at once and without
   * internet, until the backend answers. Before `start`.
   */
  setPersistence(store: PersistedQueries) {
    this.persisted = store;
  }

  /** Loads the session and opens the live connection; the provider calls it once. */
  start() {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    void this.refreshSession();
    this.connect();
    // The device knows before the socket does
    window.addEventListener('offline', () => {
      if (this.socket) this.dropped(this.socket);
    });
    window.addEventListener('online', () => {
      if (this.socket) return;
      clearTimeout(this.reconnectTimer);
      this.reconnectDelay = 1000;
      this.connect();
    });
    // Back from the background: the backoff may wait up to 30 s, the user should not
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.reconnectNow();
    });
  }

  /**
   * Connects again at once instead of waiting for the backoff, e.g. "Neu verbinden" or
   * when the app comes back: the device often does not tell that the internet is back.
   * Resolves whether the connection is up; the session is checked once it is.
   */
  reconnectNow(): Promise<boolean> {
    if (!this.started || this.connected) return Promise.resolve(this.connected);
    clearTimeout(this.reconnectTimer);
    this.reconnectDelay = 1000;
    // A socket still trying may hang on a dead network for long
    const old = this.socket;
    this.socket = null;
    if (old) {
      old.onclose = null;
      old.onmessage = null;
      old.close();
    }
    this.connect();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        stopConnected();
        stopDropped();
        resolve(this.connected);
      };
      const stopConnected = this.onConnectionChange(() => this.connected && done());
      const stopDropped = (() => {
        this.droppedListeners.add(done);
        return () => this.droppedListeners.delete(done);
      })();
      const timer = setTimeout(done, RECONNECT_NOW_TIMEOUT_MS);
    });
  }

  // --- calls

  private async post(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...this.authInit({ 'Content-Type': 'application/json' }),
      method: 'POST',
      body: JSON.stringify(body ?? {}),
      signal,
    });
    if (!response.ok) throw await readError(response);
    return response;
  }

  /** Uploads a file to the URL of `generateUploadUrl`; returns its storage id. */
  async upload(url: string, file: Blob): Promise<Id<'_storage'>> {
    const response = await fetch(url, {
      ...this.authInit({ 'Content-Type': file.type }),
      method: 'POST',
      body: file,
    });
    if (!response.ok) throw await readError(response);
    return ((await response.json()) as { storageId: Id<'_storage'> }).storageId;
  }

  private async callQuery(name: string, args: Record<string, unknown>) {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), QUERY_TIMEOUT_MS);
    try {
      const response = await this.post(`/api/query/${name}`, args, timeout.signal);
      return (await response.json()) as { value: unknown; topics: string[] };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Many queries in one request, kept on the device as if each was asked on its own:
   * the offline copy of a bazaar. Returns the answers, undefined where the backend
   * refused one, and RETRY where one failed for now (busy backend).
   */
  async batchQuery(calls: { fn: unknown; args: Record<string, unknown> }[]): Promise<unknown[]> {
    const response = await this.post('/api/batch-query', {
      calls: calls.map(({ fn, args }) => ({ name: getFunctionName(fn), args })),
    });
    const { results } = (await response.json()) as {
      results: ({ value: unknown } | { retry: true } | null)[];
    };
    return calls.map(({ fn, args }, index) => {
      const result = results[index];
      if (!result) return undefined;
      if (!('value' in result)) return RETRY;
      this.seed(getFunctionName(fn), args, result.value);
      return result.value;
    });
  }

  /**
   * Resolves once the answers so far are written: true when they are all on the device,
   * false when they are only in memory or nothing keeps them.
   */
  persistNow(): Promise<boolean> {
    return this.persisted?.flush() ?? Promise.resolve(false);
  }

  /** Whether the device keeps an answer of the query, e.g. for use without internet. */
  isOnDevice(fn: FunctionReference<'query'>, args: Record<string, unknown>): boolean {
    return this.persisted?.has(keyOf(getFunctionName(fn), args)) ?? false;
  }

  /** The last known answer of a query, loaded now or kept on the device; undefined if none. */
  answer<Query extends FunctionReference<'query'>>(
    fn: Query,
    args: Record<string, unknown>
  ): FunctionReturnType<Query> | undefined {
    const key = keyOf(getFunctionName(fn), args);
    const entry = this.entries.get(key);
    if (entry?.state.loaded && !entry.state.error)
      return entry.state.value as FunctionReturnType<Query>;
    return this.persisted?.get(key)?.value as FunctionReturnType<Query> | undefined;
  }

  /**
   * Changes the known answer of a query on the device: what an offline action did shows
   * until the backend answers again (lib/offlineActions.ts).
   */
  patchAnswer<Query extends FunctionReference<'query'>>(
    fn: Query,
    args: Record<string, unknown>,
    change: (value: FunctionReturnType<Query>) => FunctionReturnType<Query>
  ) {
    const key = keyOf(getFunctionName(fn), args);
    const current = this.answer(fn, args);
    if (current === undefined) {
      // On the device, not read yet: changed once it is
      if (this.persisted?.has(key)) {
        void this.persisted.load(key).then((known) => {
          if (known) this.patchAnswer(fn, args, change);
        });
      }
      return;
    }
    const value = change(current);
    this.persisted?.put(key, value);
    const entry = this.entries.get(key);
    if (entry) {
      entry.state = { loaded: true, value };
      entry.json = JSON.stringify(value);
      this.emit(entry);
    }
  }

  /** An answer loaded another way (batchQuery): kept, and shown where nothing is loaded yet. */
  private seed(name: string, args: Record<string, unknown>, value: unknown) {
    const key = keyOf(name, args);
    this.persisted?.put(key, value);
    const entry = this.entries.get(key);
    if (entry && (!entry.state.loaded || entry.fromDevice)) {
      entry.state = { loaded: true, value };
      entry.json = JSON.stringify(value);
      entry.fromDevice = false;
      this.emit(entry);
    }
  }

  /** One query, without following it. */
  async query<Query extends FunctionReference<'query'>>(
    fn: Query,
    ...rest: OptionalRestArgs<Query>
  ): Promise<FunctionReturnType<Query>> {
    const { value } = await this.callQuery(getFunctionName(fn), rest[0] ?? {});
    return value as FunctionReturnType<Query>;
  }

  mutation<Mutation extends FunctionReference<'mutation'>>(
    fn: Mutation,
    ...rest: OptionalRestArgs<Mutation>
  ): Promise<FunctionReturnType<Mutation>> {
    return this.runMutation(fn, rest[0] ?? {});
  }

  async runMutation(
    fn: unknown,
    args: Record<string, unknown> = {},
    optimisticUpdate?: (store: OptimisticStore, args: Record<string, unknown>) => void
  ): Promise<never> {
    const id = this.nextOptimisticId++;
    const touched = new Set<Entry>();
    if (optimisticUpdate) {
      optimisticUpdate(
        {
          getQuery: (ref, queryArgs = {}) => {
            const entry = this.entries.get(keyOf(getFunctionName(ref), queryArgs));
            return entry?.view.value;
          },
          setQuery: (ref, queryArgs = {}, value) => {
            const entry = this.entries.get(keyOf(getFunctionName(ref), queryArgs));
            if (!entry) return;
            entry.optimistic.push({ id, value });
            touched.add(entry);
            this.emit(entry);
          },
        },
        args
      );
    }
    try {
      const response = await this.post(`/api/mutation/${getFunctionName(fn)}`, args);
      const { value, topics } = (await response.json()) as { value: unknown; topics?: string[] };
      // Fresh data before the call resolves, but never stuck behind a busy query
      await Promise.race([
        this.refetchTopics(topics ?? []),
        new Promise((resolve) => setTimeout(resolve, MUTATION_REFETCH_WAIT_MS)),
      ]);
      return value as never;
    } finally {
      for (const entry of touched) {
        entry.optimistic = entry.optimistic.filter((update) => update.id !== id);
        this.emit(entry);
      }
    }
  }

  // --- followed queries

  /** Follows a query until the returned function is called. */
  watch(fn: unknown, args: Record<string, unknown>, listener: Listener): () => void {
    const entry = this.entry(getFunctionName(fn), args);
    clearTimeout(entry.evictTimer);
    entry.listeners.add(listener);
    return () => {
      entry.listeners.delete(listener);
      if (entry.listeners.size > 0) return;
      entry.evictTimer = setTimeout(() => {
        if (entry.listeners.size > 0) return;
        this.entries.delete(keyOf(entry.name, entry.args));
        this.syncTopics();
      }, KEEP_UNWATCHED_MS);
    };
  }

  /** The current state of a query; the same object until it changes. */
  snapshot(fn: unknown, args: Record<string, unknown>): QueryState {
    return this.entries.get(keyOf(getFunctionName(fn), args))?.view ?? EMPTY;
  }

  private entry(name: string, args: Record<string, unknown>): Entry {
    const key = keyOf(name, args);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        name,
        args,
        state: EMPTY,
        view: EMPTY,
        topics: [],
        listeners: new Set(),
        fetching: false,
        waiting: [],
        again: false,
        retries: 0,
        fromDevice: false,
        optimistic: [],
        lastLoad: 0,
      };
      const known = this.persisted?.get(key);
      if (known) {
        this.showFromDevice(entry, known.value);
        entry.view = entry.state;
      } else if (this.persisted?.has(key)) {
        // Read from the device while the backend is asked; whichever answers first shows
        const created = entry;
        void this.persisted.load(key).then((stored) => {
          if (stored && !created.state.loaded && this.entries.get(key) === created) {
            this.showFromDevice(created, stored.value);
            this.emit(created);
          }
        });
      }
      this.entries.set(key, entry);
      void this.fetch(entry);
    }
    return entry;
  }

  /** The answer kept on the device, until the backend answers; emit tells the pages */
  private showFromDevice(entry: Entry, value: unknown) {
    entry.state = { loaded: true, value };
    entry.json = JSON.stringify(value);
    entry.fromDevice = true;
  }

  /**
   * The answers on the device were of another user: what pages show of them goes, they
   * show loading until the backend answers for the user now.
   */
  private forgetDeviceAnswers() {
    for (const entry of this.entries.values()) {
      if (!entry.fromDevice) continue;
      entry.fromDevice = false;
      entry.json = undefined;
      entry.state = EMPTY;
      this.emit(entry);
    }
  }

  private emit(entry: Entry) {
    const last = entry.optimistic.at(-1);
    const view = last ? { loaded: true, value: last.value } : entry.state;
    if (
      view.loaded === entry.view.loaded &&
      view.value === entry.view.value &&
      view.error === entry.view.error
    ) {
      return;
    }
    entry.view = view;
    for (const listener of [...entry.listeners]) listener();
  }

  /**
   * Loads the query again. Resolves once a load that started after the call is done, so
   * a mutation can wait for fresh data even while more changes keep coming in.
   */
  private fetch(entry: Entry): Promise<void> {
    const done = new Promise<void>((resolve) => entry.waiting.push(resolve));
    if (entry.fetching) {
      entry.again = true;
      return done;
    }
    entry.fetching = true;
    void (async () => {
      do {
        entry.again = false;
        // This load sees every change reported so far
        clearTimeout(entry.liveTimer);
        entry.liveTimer = undefined;
        entry.lastLoad = Date.now();
        const served = entry.waiting;
        entry.waiting = [];
        try {
          const { value, topics } = await this.callQuery(entry.name, entry.args);
          const json = JSON.stringify(value);
          if (json !== entry.json || entry.fromDevice) {
            this.persisted?.put(keyOf(entry.name, entry.args), value);
            entry.fromDevice = false;
          }
          if (json !== entry.json || !entry.state.loaded || entry.state.error) {
            entry.json = json;
            entry.state = { loaded: true, value };
          }
          entry.topics = topics;
          entry.retries = 0;
        } catch (error) {
          // Network and server errors are usually over soon: keep the last answer (or
          // keep loading) and try again; errors of the function itself are shown
          const transient = !(error instanceof ApiError) || error.status >= 500;
          if (transient && entry.retries < MAX_RETRIES) {
            this.retryLater(entry);
          } else if (!transient || !entry.state.loaded) {
            entry.json = undefined;
            entry.state = { loaded: true, error };
          }
        }
        this.syncTopics();
        this.emit(entry);
        for (const resolve of served) resolve();
      } while (entry.again);
      entry.fetching = false;
    })();
    return done;
  }

  /** Loads the failed queries again: "Try again" after an error page. */
  retryFailed() {
    for (const entry of this.entries.values()) {
      if (!entry.state.error) continue;
      entry.state = EMPTY;
      entry.retries = 0;
      this.emit(entry);
      void this.fetch(entry);
    }
  }

  private retryLater(entry: Entry) {
    const delay = 500 * 2 ** entry.retries;
    entry.retries += 1;
    setTimeout(() => {
      if (this.entries.get(keyOf(entry.name, entry.args)) === entry) void this.fetch(entry);
    }, delay);
  }

  private refetchTopics(topics: string[]): Promise<unknown> {
    if (topics.length === 0) return Promise.resolve();
    const changed = new Set(topics);
    const affected = [...this.entries.values()].filter((entry) =>
      entry.topics.some((topic) => changed.has(topic))
    );
    return Promise.all(affected.map((entry) => this.fetch(entry)));
  }

  /** Changes of others: bundled per query, spread out, at most once per interval. */
  private refetchLater(topics: string[]) {
    const changed = new Set(topics);
    for (const entry of this.entries.values()) {
      if (entry.liveTimer || !entry.topics.some((topic) => changed.has(topic))) continue;
      const jitter = Math.random() * LIVE_JITTER_MS;
      const delay = Math.max(jitter, entry.lastLoad + LIVE_MIN_INTERVAL_MS - Date.now());
      entry.liveTimer = setTimeout(() => {
        entry.liveTimer = undefined;
        if (this.entries.get(keyOf(entry.name, entry.args)) === entry) void this.fetch(entry);
      }, delay);
    }
  }

  private refetchAll(): Promise<unknown> {
    return Promise.all([...this.entries.values()].map((entry) => this.fetch(entry)));
  }

  // --- live connection

  private connect() {
    const base = this.baseUrl || window.location.origin;
    const url = `${base.replace(/^http/, 'ws')}/api/ws`;
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      const token = this.app?.getToken();
      if (token) socket.send(JSON.stringify({ type: 'auth', token }));
      this.setConnected(true);
      this.reconnectDelay = 1000;
      this.startPings(socket);
      if (this.sessionUnchecked) void this.refreshSession();
      this.following = new Set();
      this.syncTopics();
      // Changes while there was no connection are unknown
      if (this.everConnected) void this.refetchAll();
      this.everConnected = true;
    };
    socket.onmessage = (event) => {
      this.lastMessageAt = Date.now();
      let message: { type?: string; topics?: string[] };
      try {
        message = JSON.parse(String(event.data)) as typeof message;
      } catch {
        return;
      }
      if (message.type === 'invalidate') this.refetchLater(message.topics ?? []);
      if (message.type === 'resync') void this.refetchAll();
      if (message.type === 'pong') this.serverAnswersPings = true;
    };
    socket.onclose = () => this.dropped(socket);
  }

  /** The socket is gone (closed, or dead without notice): reconnect with backoff. */
  private dropped(socket: WebSocket) {
    if (this.socket !== socket) return;
    this.socket = null;
    clearInterval(this.pingTimer);
    socket.onclose = null;
    socket.onmessage = null;
    // A dead connection may take long to close; this socket is done for us anyway
    socket.close();
    this.setConnected(false);
    this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
    for (const listener of [...this.droppedListeners]) listener();
  }

  private startPings(socket: WebSocket) {
    clearInterval(this.pingTimer);
    this.lastMessageAt = Date.now();
    this.pingTimer = setInterval(() => {
      if (this.socket !== socket) return;
      if (this.serverAnswersPings && Date.now() - this.lastMessageAt > DEAD_AFTER_MS) {
        this.dropped(socket);
        return;
      }
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }));
    }, PING_INTERVAL_MS);
  }

  /** The socket sends user topics only to the user it was opened by: reopen on sign-in. */
  private reconnect() {
    if (!this.started) return;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.pingTimer);
    const old = this.socket;
    this.socket = null;
    this.connected = false;
    old?.close();
    this.connect();
  }

  private syncTopics() {
    const socket = this.socket;
    if (!socket || !this.connected || socket.readyState !== WebSocket.OPEN) return;
    const wanted = new Set<string>();
    for (const entry of this.entries.values()) {
      for (const topic of entry.topics) wanted.add(topic);
    }
    const add = [...wanted].filter((topic) => !this.following.has(topic));
    const remove = [...this.following].filter((topic) => !wanted.has(topic));
    if (add.length > 0) socket.send(JSON.stringify({ type: 'subscribe', topics: add }));
    if (remove.length > 0) socket.send(JSON.stringify({ type: 'unsubscribe', topics: remove }));
    this.following = wanted;
  }

  /** Whether the live connection is up; public pages work without it. */
  isConnected() {
    return this.connected;
  }

  /** Called when the live connection goes up or down, e.g. for the offline cash desk. */
  onConnectionChange(listener: Listener): () => void {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  private setConnected(connected: boolean) {
    if (this.connected === connected) return;
    this.connected = connected;
    for (const listener of [...this.connectionListeners]) listener();
  }

  // --- sign-in

  getAuth(): AuthState {
    return this.auth;
  }

  onAuthChange(listener: Listener): () => void {
    this.authListeners.add(listener);
    return () => this.authListeners.delete(listener);
  }

  private setAuth(auth: AuthState, confirmed = true) {
    const changed = auth.userId !== this.auth.userId;
    // Answers of someone else must not show, also not those pages took while the session
    // loaded; checked by the backend only. Also when nobody is signed in now
    if (confirmed && !auth.isLoading && this.persisted && this.persisted.owner() !== auth.userId) {
      this.persisted.claim(auth.userId);
      this.forgetDeviceAnswers();
    }
    // The offline queues and keys of this user; without connection the device's last one
    if (!auth.isLoading) setDeviceOwner(auth.userId);
    this.auth = auth;
    for (const listener of [...this.authListeners]) listener();
    if (changed) {
      this.reconnect();
      void this.refetchAll();
    }
  }

  async refreshSession() {
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/session`, this.authInit());
      const body = (await response.json()) as { userId: string | null };
      this.sessionUnchecked = false;
      this.setAuth({ isLoading: false, userId: body.userId ?? null });
    } catch {
      // Without connection the device's last user stays signed in, with its answers
      const known = this.persisted?.owner() ?? null;
      this.sessionUnchecked = known !== null;
      this.setAuth({ isLoading: false, userId: known }, false);
    }
  }

  /**
   * Signs in: "password" with a `flow`, or an OAuth provider, which
   * leaves the page.
   */
  async signIn(
    provider: string,
    params: Record<string, unknown> = {}
  ): Promise<{ signingIn: boolean; redirect?: URL }> {
    if (provider !== 'password' && this.app) {
      this.oauthVerifier = randomBase64Url(32);
      const redirect = new URL(`${this.baseUrl}/api/auth/oauth/${provider}`);
      redirect.searchParams.set('challenge', await sha256Base64Url(this.oauthVerifier));
      await this.app.openExternal(redirect.toString());
      return { signingIn: false, redirect };
    }
    if (provider !== 'password') {
      const redirect = new URL(
        `${this.baseUrl}/api/auth/oauth/${provider}`,
        window.location.origin
      );
      if (typeof params.redirectTo === 'string') {
        redirect.searchParams.set('redirectTo', params.redirectTo);
      }
      window.location.assign(redirect.toString());
      return { signingIn: false, redirect };
    }
    const response = await this.post('/api/auth/password', params);
    const result = (await response.json()) as { signingIn: boolean; token?: string };
    if (result.token) this.app?.setToken(result.token);
    if (result.signingIn) await this.refreshSession();
    return { signingIn: result.signingIn };
  }

  /** The app's OAuth deep link `bazarpro://auth?code=…` came back. */
  async completeAppSignIn(code: string) {
    const verifier = this.oauthVerifier;
    this.oauthVerifier = null;
    if (!this.app || !verifier) throw new ApiError(400, { code: 'OAUTH_FAILED', message: '' });
    const response = await this.post('/api/auth/app-exchange', { code, verifier });
    const { token } = (await response.json()) as { token: string };
    this.app.setToken(token);
    await this.refreshSession();
  }

  /** Changes the password of the signed-in user; wrong old passwords count like sign-ins. */
  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    await this.post('/api/auth/change-password', { oldPassword, newPassword });
  }

  async signOut() {
    await fetch(`${this.baseUrl}/api/auth/signout`, { ...this.authInit(), method: 'POST' });
    // The keys of the IDs stay with the account, not on the device; the queues wait for
    // the user to sign in again
    await removeDeviceFiles('check-in');
    this.app?.setToken(null);
    this.setAuth({ isLoading: false, userId: null });
  }
}

function randomBase64Url(bytes: number) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sha256Base64Url(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return toBase64Url(new Uint8Array(digest));
}

function toBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
