import { createElement, lazy, type ComponentType } from 'react';

/**
 * Pages behind the sign-in load as their own chunks, so visitors of the public pages
 * (and search engines) download less. Signed-in users preload them all (preloadPages),
 * so a lost connection at the cash desk does not stop them from switching pages.
 */

const loaders: (() => Promise<unknown>)[] = [];

const RELOADED_KEY = 'bazarpro.chunkReload';
const RELOAD_PAUSE_MS = 10_000;
const PRELOAD_RETRY_MS = 60_000;

/** A page's code could not be loaded: the connection is gone or a new version is out. */
export class PageLoadError extends Error {
  constructor(cause: unknown) {
    super('Page could not be loaded', { cause });
    this.name = 'PageLoadError';
  }
}

/**
 * navigator.onLine also says yes on a hall Wi-Fi without internet, where a reload would
 * end on the browser's error page and lose the running app: ask the server first.
 */
export async function isServerReachable(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
  try {
    await fetch(window.location.origin, { method: 'HEAD', cache: 'no-store' });
    return true;
  } catch {
    return false;
  }
}

/**
 * A chunk that fails to load while the server answers is from an older deploy: its file
 * is gone. Loading the page again fetches the current ones, once.
 */
async function reloadForNewDeploy(error: unknown): Promise<never> {
  if (await isServerReachable()) {
    try {
      const last = Number(sessionStorage.getItem(RELOADED_KEY) ?? 0);
      if (Date.now() - last > RELOAD_PAUSE_MS) {
        sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
        window.location.reload();
      }
    } catch {
      // No session storage: show the error instead of risking a reload loop
    }
  }
  throw new PageLoadError(error);
}

/** "Try again" after a failed page: browsers may keep a failed import until a reload. */
export async function retryPageLoad(): Promise<void> {
  if (await isServerReachable()) window.location.reload();
}

/** A named page export as lazy component: `lazyPage(() => import('./X'), 'X')`. */
export function lazyPage<M, K extends keyof M>(load: () => Promise<M>, name: K) {
  loaders.push(load);
  // React.lazy keeps a failure for good: after one, the next render starts a new attempt
  const create = () =>
    lazy(() =>
      load().then(
        (module) => ({ default: module[name] as ComponentType<Record<string, never>> }),
        (error: unknown) => {
          current = create();
          return reloadForNewDeploy(error);
        }
      )
    );
  let current = create();
  return function LazyPage() {
    return createElement(current);
  };
}

let preloaded = false;
let preloading = false;

/** Loads all lazy pages in the background, until all are there. */
export function preloadPages() {
  if (preloaded || preloading) return;
  preloading = true;
  void Promise.allSettled(loaders.map((load) => load())).then((results) => {
    preloading = false;
    if (results.every((result) => result.status === 'fulfilled')) preloaded = true;
    else setTimeout(preloadPages, PRELOAD_RETRY_MS);
  });
}
