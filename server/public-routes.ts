// Public pages without event or product data; listed in the sitemap.
import { DEFAULT_LOCALE } from '../src/shared/constants.ts';
import {
  PREFIXED_LOCALES,
  isLocalizedRoute,
  localizedPath,
  splitLocalePrefix,
} from '../src/shared/localizedRoutes.ts';

/** Advertising for BazarPro itself; not served by single-association instances. */
export const MARKETING_ROUTES = ['/features', '/pricing', '/about'];

/** Impressum, Datenschutz, AGB: texts come from the backend, so they are not prerendered. */
export const LEGAL_ROUTES = ['/privacy', '/terms', '/imprint'];

export const STATIC_PUBLIC_ROUTES = [...MARKETING_ROUTES, '/contact', ...LEGAL_ROUTES];

/**
 * Pages rendered into static HTML at build time (scripts/prerender-public.js), each
 * also in the other languages (`/en/features`). Without `/`, which the script adds last.
 */
export const PRERENDERED_ROUTES = STATIC_PUBLIC_ROUTES.filter(
  (route) => !LEGAL_ROUTES.includes(route)
).flatMap((route) => [route, ...PREFIXED_LOCALES.map((locale) => localizedPath(route, locale))]);

/** The start page in the other languages (`/en`), prerendered like the other pages. */
export const LOCALIZED_START_PAGES = PREFIXED_LOCALES.map((locale) => localizedPath('/', locale));

export type InstanceMode = 'platform' | 'single';

export function parseInstanceMode(value: string | undefined): InstanceMode {
  return value === 'single' ? 'single' : 'platform';
}

/** Static pages of an instance: without the marketing pages in `single` mode. */
export function staticRoutesFor(mode: InstanceMode): string[] {
  return mode === 'single'
    ? STATIC_PUBLIC_ROUTES.filter((route) => !MARKETING_ROUTES.includes(route))
    : STATIC_PUBLIC_ROUTES;
}

/** The landing page and the marketing pages in every language, with or without trailing slash. */
export function isMarketingPath(pathname: string): boolean {
  const { path } = splitLocalePrefix(pathname);
  return path === '/' || path === '/index.html' || MARKETING_ROUTES.includes(path);
}

/**
 * The one address of a page with an address per language, when the request used
 * another spelling (`/Features/`, `/EN`, `/en/`); null when it is already that address
 * or no such page. Canonical links name it too, a redirect also merges the signals.
 */
export function canonicalLocalizedPath(pathname: string): string | null {
  const { locale, path } = splitLocalePrefix(pathname);
  const route = path.toLowerCase();
  if (!isLocalizedRoute(route)) return null;
  const canonical = localizedPath(route, locale ?? DEFAULT_LOCALE);
  return canonical === pathname ? null : canonical;
}
