/**
 * The answers of the backend kept on the device, so pages show the last state without
 * internet (ApiClient.setPersistence). At start only which answers there are is read; an
 * answer itself is read when a page asks for it (load), so a device with a whole bazaar
 * on it starts at once. Writes are collected and stored together. They belong to one
 * user: another one starts empty.
 */

export type PersistedAnswer = { value: unknown; at: number };

export interface PersistedQueries {
  /** The answer, when it is in memory: put this session or loaded */
  get(key: string): PersistedAnswer | undefined;
  /** Whether the device keeps an answer, in memory or not read yet */
  has(key: string): boolean;
  /** Reads the answer from the device; undefined when there is none */
  load(key: string): Promise<PersistedAnswer | undefined>;
  put(key: string, value: unknown): void;
  /** The user the answers belong to; null when nobody was signed in */
  owner(): string | null;
  /** Forgets everything when the answers are not of `user` */
  claim(user: string | null): void;
  /**
   * Resolves once everything put so far is written: true when it is all on the device,
   * false when only in memory (no IndexedDB, storage full)
   */
  flush(): Promise<boolean>;
}

/** In memory only, for tests and as fallback when IndexedDB is not there. */
export function memoryQueries(): PersistedQueries {
  const answers = new Map<string, PersistedAnswer>();
  let owner: string | null = null;
  return {
    get: (key) => answers.get(key),
    has: (key) => answers.has(key),
    load: (key) => Promise.resolve(answers.get(key)),
    put: (key, value) => void answers.set(key, { value, at: Date.now() }),
    owner: () => owner,
    claim(user) {
      if (user === owner) return;
      answers.clear();
      owner = user;
    },
    flush: () => Promise.resolve(false),
  };
}

const DB_NAME = 'bazarpro-offline';
const STORE = 'answers';
const OWNER_KEY = '\u0000owner';
/**
 * A bazaar with every product page is 5-6 answers per item, so about 25 000 for 4 000
 * items; older ones go first (offlinePrefetch stores the event's own ones last)
 */
const MAX_ANSWERS = 50_000;
const WRITE_DELAY_MS = 1000;
/** Index of the answers by when they were stored */
const BY_AGE = 'at';
const PRUNE_DELAY_MS = 10_000;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  const open = indexedDB.open(DB_NAME, 2);
  open.onupgradeneeded = () => {
    const db = open.result;
    const store = db.objectStoreNames.contains(STORE)
      ? open.transaction!.objectStore(STORE)
      : db.createObjectStore(STORE);
    // The oldest answers go first, found without reading them
    if (!store.indexNames.contains(BY_AGE)) store.createIndex(BY_AGE, 'at');
  };
  return request(open);
}

/**
 * The answers stored in IndexedDB; in memory only when it cannot be opened. `maxAnswers`
 * is lower only in tests.
 */
export async function openPersistedQueries(maxAnswers = MAX_ANSWERS): Promise<PersistedQueries> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return memoryQueries();
  }
  /** Answers read or put this session */
  const answers = new Map<string, PersistedAnswer>();
  /** Keys of the answers on the device, read or not */
  const known = new Set<string>();
  let owner: string | null = null;
  try {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const [keys, stored] = await Promise.all([
      request(store.getAllKeys()),
      request(store.get(OWNER_KEY) as IDBRequest<string | null | undefined>),
    ]);
    for (const key of keys) if (key !== OWNER_KEY) known.add(String(key));
    owner = stored ?? null;
  } catch {
    // Unreadable: start empty
  }

  // Changes since the last write; undefined deletes
  let pending = new Map<string, PersistedAnswer | string | null | undefined>();
  /** Everything goes before the pending changes are written: another user signed in */
  let clearFirst = false;
  /** Keys whose last write failed: on the device is an older answer or none */
  const unstored = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** The last write; the next one waits for it, so flush() covers all before it */
  let written: Promise<void> = Promise.resolve();
  const flush = (): Promise<boolean> => {
    clearTimeout(timer);
    timer = undefined;
    const batch = pending;
    const clear = clearFirst;
    pending = new Map();
    clearFirst = false;
    if (batch.size > 0 || clear) {
      written = written.then(
        () =>
          new Promise<void>((resolve) => {
            const done = (ok: boolean) => {
              for (const key of batch.keys()) {
                if (ok) unstored.delete(key);
                else unstored.add(key);
              }
              resolve();
            };
            try {
              const tx = db.transaction(STORE, 'readwrite');
              const store = tx.objectStore(STORE);
              if (clear) store.clear();
              for (const [key, value] of batch) {
                if (value === undefined) store.delete(key);
                else store.put(value, key);
              }
              tx.oncomplete = () => done(true);
              // Storage full or gone: the answers stay in memory for this session
              tx.onerror = tx.onabort = () => done(false);
            } catch {
              done(false);
            }
          })
      );
    }
    return written.then(() => unstored.size === 0);
  };
  // The app may be ended in the background; store what is pending before
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
  window.addEventListener('pagehide', () => void flush());
  const write = (key: string, value: PersistedAnswer | string | null | undefined) => {
    pending.set(key, value);
    timer ??= setTimeout(() => void flush(), WRITE_DELAY_MS);
  };
  /** Reads running, so a page and the client ask the device once per answer */
  const reading = new Map<string, Promise<PersistedAnswer | undefined>>();
  /** Counts the user changes: a read started before one is of the other user's answers */
  let owners = 0;
  const load = (key: string): Promise<PersistedAnswer | undefined> => {
    const answer = answers.get(key);
    if (answer || !known.has(key)) return Promise.resolve(answer);
    let pendingRead = reading.get(key);
    if (!pendingRead) {
      const started = owners;
      pendingRead = (async () => {
        let stored: PersistedAnswer | undefined;
        try {
          const store = db.transaction(STORE, 'readonly').objectStore(STORE);
          stored = await request(store.get(key) as IDBRequest<PersistedAnswer | undefined>);
        } catch {
          stored = undefined;
        }
        reading.delete(key);
        if (started !== owners || !known.has(key)) return undefined;
        // Put meanwhile: newer than what was on the device
        const current = answers.get(key) ?? stored;
        if (current) answers.set(key, current);
        return current;
      })();
      reading.set(key, pendingRead);
    }
    return pendingRead;
  };
  let pruning = false;
  /** Drops the oldest answers beyond maxAnswers, found by the index without reading them */
  const prune = async () => {
    if (pruning || known.size <= maxAnswers) return;
    pruning = true;
    try {
      const excess = known.size - maxAnswers;
      const started = owners;
      const oldest: string[] = await new Promise((resolve, reject) => {
        const keys: string[] = [];
        const index = db.transaction(STORE, 'readonly').objectStore(STORE).index(BY_AGE);
        const cursor = index.openKeyCursor();
        cursor.onsuccess = () => {
          const at = cursor.result;
          if (!at || keys.length >= excess) return resolve(keys);
          keys.push(String(at.primaryKey));
          at.continue();
        };
        cursor.onerror = () => reject(cursor.error);
      });
      if (started !== owners) return;
      for (const key of oldest) {
        answers.delete(key);
        known.delete(key);
        write(key, undefined);
      }
    } catch {
      // Tried again with the next answers put
    } finally {
      pruning = false;
    }
  };
  // Not in the way of the start
  setTimeout(() => void prune(), PRUNE_DELAY_MS);

  return {
    get: (key) => answers.get(key),
    has: (key) => answers.has(key) || known.has(key),
    load,
    put(key, value) {
      const answer = { value, at: Date.now() };
      answers.set(key, answer);
      known.add(key);
      write(key, answer);
      if (known.size > maxAnswers * 1.1) void prune();
    },
    owner: () => owner,
    claim(user) {
      if (user === owner) return;
      owners += 1;
      answers.clear();
      known.clear();
      pending = new Map();
      clearFirst = true;
      owner = user;
      write(OWNER_KEY, user);
    },
    flush,
  };
}
