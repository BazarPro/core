/**
 * The answers of the backend kept on the device, so pages show the last state without
 * internet (ApiClient.setPersistence). Loaded into memory once at start; writes are
 * collected and stored together. They belong to one user: another one starts empty.
 */

export type PersistedAnswer = { value: unknown; at: number };

export interface PersistedQueries {
  get(key: string): PersistedAnswer | undefined;
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

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  const open = indexedDB.open(DB_NAME, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(STORE);
  return request(open);
}

/** The answers stored in IndexedDB; in memory only when it cannot be opened. */
export async function openPersistedQueries(): Promise<PersistedQueries> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return memoryQueries();
  }
  const answers = new Map<string, PersistedAnswer>();
  let owner: string | null = null;
  try {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const [keys, values] = await Promise.all([
      request(store.getAllKeys()),
      request(store.getAll() as IDBRequest<unknown[]>),
    ]);
    keys.forEach((key, index) => {
      if (key === OWNER_KEY) owner = (values[index] as string | null) ?? null;
      else answers.set(String(key), values[index] as PersistedAnswer);
    });
  } catch {
    // Unreadable: start empty
  }

  // Changes since the last write; undefined deletes
  let pending = new Map<string, PersistedAnswer | string | null | undefined>();
  /** Keys whose last write failed: on the device is an older answer or none */
  const unstored = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** The last write; the next one waits for it, so flush() covers all before it */
  let written: Promise<void> = Promise.resolve();
  const flush = (): Promise<boolean> => {
    clearTimeout(timer);
    timer = undefined;
    const batch = pending;
    pending = new Map();
    if (batch.size > 0) {
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
  const prune = () => {
    if (answers.size <= MAX_ANSWERS) return;
    const oldest = [...answers.entries()].sort((a, b) => a[1].at - b[1].at);
    for (const [key] of oldest.slice(0, answers.size - MAX_ANSWERS)) {
      answers.delete(key);
      write(key, undefined);
    }
  };
  prune();

  return {
    get: (key) => answers.get(key),
    put(key, value) {
      const answer = { value, at: Date.now() };
      answers.set(key, answer);
      write(key, answer);
      if (answers.size > MAX_ANSWERS * 1.1) prune();
    },
    owner: () => owner,
    claim(user) {
      if (user === owner) return;
      for (const key of answers.keys()) write(key, undefined);
      answers.clear();
      owner = user;
      write(OWNER_KEY, user);
    },
    flush,
  };
}
