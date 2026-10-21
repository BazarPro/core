import { BackendUnavailableError, type BackendQueryClient } from './backend.ts';
import {
  eventMeta,
  notFoundMeta,
  productMeta,
  type PageMeta,
  type PublicEvent,
  type PublicProduct,
} from './seo.ts';
import { staticRoutesFor, type InstanceMode } from './public-routes.ts';
import { buildSitemap, type SitemapEvent, type SitemapProduct } from './sitemap.ts';

export interface PageResult {
  status: 200 | 404;
  meta: PageMeta;
}

const EVENT_ROUTE = /^\/public-events\/([^/]+)\/?$/;
const EVENT_PRODUCTS_ROUTE = /^\/public-events\/([^/]+)\/products\/?$/;
const PRODUCT_ROUTE = /^\/products\/view\/([^/]+)\/?$/;

export function isDynamicRoute(pathname: string): boolean {
  return [EVENT_ROUTE, EVENT_PRODUCTS_ROUTE, PRODUCT_ROUTE].some((route) => route.test(pathname));
}

/**
 * Head metadata for data-driven public pages. Returns null for other routes and
 * when the backend is unavailable (the caller then serves the plain SPA shell).
 */
export async function resolvePage(
  pathname: string,
  backend: BackendQueryClient,
  siteUrl: string,
  siteName?: string
): Promise<PageResult | null> {
  try {
    const eventMatch = pathname.match(EVENT_ROUTE) ?? pathname.match(EVENT_PRODUCTS_ROUTE);
    if (eventMatch) {
      const id = decodeURIComponent(eventMatch[1]);
      const event = await backend.query<PublicEvent>('events.getPublicEventForViewer', { id });
      if (!event) return { status: 404, meta: notFoundMeta(siteName) };
      const page = EVENT_ROUTE.test(pathname) ? 'event' : 'eventProducts';
      return { status: 200, meta: eventMeta(event, siteUrl, page, siteName) };
    }

    const productMatch = pathname.match(PRODUCT_ROUTE);
    if (productMatch) {
      const productId = decodeURIComponent(productMatch[1]);
      const product = await backend.query<PublicProduct & { images?: string[] }>(
        'products.getProduct',
        { productId }
      );
      if (!product) return { status: 404, meta: notFoundMeta(siteName) };
      const firstImage = product.images?.[0];
      const imageUrls = firstImage
        ? await backend.query<string[]>('products.getImageUrls', { storageIds: [firstImage] })
        : null;
      return { status: 200, meta: productMeta(product, imageUrls?.[0], siteUrl, siteName) };
    }

    return null;
  } catch (err) {
    if (err instanceof BackendUnavailableError) {
      console.warn(`[seo] ${err.message}`);
      return null;
    }
    throw err;
  }
}

/** Sitemap with current public events and their products; null if the backend is unavailable. */
export async function resolveSitemap(
  backend: BackendQueryClient,
  siteUrl: string,
  mode: InstanceMode = 'platform'
): Promise<string | null> {
  try {
    const events =
      (await backend.query<(SitemapEvent & { visibility?: string })[]>('events.get', {})) ?? [];
    const publicEvents = events.filter((event) => event.visibility === 'public');
    const products = new Map<string, SitemapProduct>();
    for (const event of publicEvents) {
      const eventProducts =
        (await backend.query<SitemapProduct[]>('eventProducts.getProductsForEvent', {
          eventId: event._id,
        })) ?? [];
      for (const product of eventProducts) products.set(product._id, product);
    }
    return buildSitemap(
      siteUrl,
      publicEvents,
      [...products.values()],
      Date.now(),
      staticRoutesFor(mode)
    );
  } catch (err) {
    if (err instanceof BackendUnavailableError) {
      console.warn(`[sitemap] ${err.message}`);
      return null;
    }
    throw err;
  }
}

const BRAND_CACHE_MS = 60_000;
let brandCache: { value: string; expires: number } | null = null;

/**
 * Site name for page titles: the association's name on a self-hosted instance
 * (admin settings, cached for a minute), BazarPro on the platform.
 */
export async function resolveSiteName(
  backend: BackendQueryClient,
  mode: InstanceMode,
  now = Date.now()
): Promise<string | undefined> {
  if (mode !== 'single') return undefined;
  if (brandCache && brandCache.expires > now) return brandCache.value;
  try {
    const config = await backend.query<{ brand: string }>('instance.getConfig', {});
    if (!config) return undefined;
    brandCache = { value: config.brand, expires: now + BRAND_CACHE_MS };
    return config.brand;
  } catch (err) {
    if (err instanceof BackendUnavailableError) return brandCache?.value;
    throw err;
  }
}

/** For tests */
export function clearSiteNameCache() {
  brandCache = null;
}
