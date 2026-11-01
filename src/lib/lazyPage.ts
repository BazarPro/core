import { lazy, type ComponentType } from 'react';

/**
 * Pages behind the sign-in load as their own chunks, so visitors of the public pages
 * (and search engines) download less. Signed-in users preload them all (preloadPages),
 * so a lost connection at the cash desk does not stop them from switching pages.
 */

const loaders: (() => Promise<unknown>)[] = [];

const RELOADED_KEY = 'bazarpro.chunkReload';
const RELOAD_PAUSE_MS = 10_000;

/**
 * A chunk that fails to load while online is from an older deploy: its file is gone.
 * Loading the page again fetches the current ones, once; offline the error stays.
 */
function reloadForNewDeploy(error: unknown): never {
  if (typeof navigator !== 'undefined' && navigator.onLine) {
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
  throw error;
}

/** A named page export as lazy component: `lazyPage(() => import('./X'), 'X')`. */
export function lazyPage<M, K extends keyof M>(load: () => Promise<M>, name: K) {
  loaders.push(load);
  return lazy(() =>
    load().then(
      (module) => ({ default: module[name] as ComponentType<Record<string, never>> }),
      reloadForNewDeploy
    )
  );
}

let preloaded = false;

/** Loads all lazy pages in the background, once. */
export function preloadPages() {
  if (preloaded) return;
  preloaded = true;
  for (const load of loaders) void load().catch(() => undefined);
}
