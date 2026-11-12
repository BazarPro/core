// Shared by the app and the web server (server/index.ts).
import { isLocalizedRoute, splitLocalePrefix } from './localizedRoutes.ts';

/**
 * Paths of the <Route>s in src/App.tsx. The web server answers other paths with
 * 404, so search engines drop them instead of indexing the start page under them.
 * appRoutes.test.ts keeps the list in sync with App.tsx. Without the pages in other
 * languages (`/en/features`, src/shared/localizedRoutes.ts), which isAppRoute adds.
 */
export const APP_ROUTES = [
  '/',
  '/login',
  '/register',
  '/password-reset-request',
  '/features',
  '/pricing',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  '/imprint',
  '/invite/:token',
  '/benachrichtigungen/abbestellen',
  '/products/view/:productId',
  '/p/:productId',
  '/public-events/:eventId',
  '/public-events/:eventId/products',
  '/browse-events',
  '/my-products',
  '/my-sales',
  '/products/new',
  '/products/edit/:productId',
  '/account',
  '/my-events',
  '/events/new',
  '/events/edit/:eventId',
  '/events/view/:eventId',
  '/events/view/:eventId/sellers',
  '/events/view/:eventId/products',
  '/events/view/:eventId/checkout',
  '/events/view/:eventId/cash',
  '/events/view/:eventId/promo',
  '/events/view/:eventId/settings',
  '/admin-panel',
  '/admin/users',
  '/admin/events',
  '/admin',
  '/admin/reports',
  '/admin/categories',
  '/admin/content',
  '/admin/messages',
  '/admin/log',
  '/admin/settings',
  '/admin/pages',
];

function toPattern(route: string): RegExp {
  const segments = route
    .split('/')
    .filter(Boolean)
    .map((segment) =>
      segment.startsWith(':') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
  // Like React Router: case-insensitive, with or without trailing slash
  return new RegExp(`^/${segments.join('/')}${segments.length ? '/?' : ''}$`, 'i');
}

const PATTERNS = APP_ROUTES.map(toPattern);

/** Whether the app renders a page for this path (instead of sending it to the start page). */
export function isAppRoute(pathname: string): boolean {
  if (PATTERNS.some((pattern) => pattern.test(pathname))) return true;
  // The same pages in another language: /en, /en/features, ...
  const { locale, path } = splitLocalePrefix(pathname);
  return locale !== null && isLocalizedRoute(path);
}
