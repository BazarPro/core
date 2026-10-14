// Public pages without event or product data; listed in the sitemap.

/** Advertising for BazarPro itself; not served by single-association instances. */
export const MARKETING_ROUTES = ['/features', '/pricing', '/about'];

/** Impressum, Datenschutz, AGB: texts come from Convex, so they are not prerendered. */
export const LEGAL_ROUTES = ['/privacy', '/terms', '/imprint'];

export const STATIC_PUBLIC_ROUTES = [...MARKETING_ROUTES, '/contact', ...LEGAL_ROUTES];

/** Pages rendered into static HTML at build time (scripts/prerender-public.js). */
export const PRERENDERED_ROUTES = STATIC_PUBLIC_ROUTES.filter(
  (route) => !LEGAL_ROUTES.includes(route)
);

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

/** The landing page and the marketing pages, with or without trailing slash. */
export function isMarketingPath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return path === '/' || path === '/index.html' || MARKETING_ROUTES.includes(path);
}
