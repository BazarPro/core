import { ConvexUnavailableError, type ConvexQueryClient } from './convex.ts';
import {
  eventMeta,
  notFoundMeta,
  productMeta,
  type PageMeta,
  type PublicEvent,
  type PublicProduct,
} from './seo.ts';
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
 * when Convex is unavailable (the caller then serves the plain SPA shell).
 */
export async function resolvePage(
  pathname: string,
  convex: ConvexQueryClient,
  siteUrl: string
): Promise<PageResult | null> {
  try {
    const eventMatch = pathname.match(EVENT_ROUTE) ?? pathname.match(EVENT_PRODUCTS_ROUTE);
    if (eventMatch) {
      const id = decodeURIComponent(eventMatch[1]);
      const event = await convex.query<PublicEvent>('events:getPublicEventForViewer', { id });
      if (!event) return { status: 404, meta: notFoundMeta() };
      const page = EVENT_ROUTE.test(pathname) ? 'event' : 'eventProducts';
      return { status: 200, meta: eventMeta(event, siteUrl, page) };
    }

    const productMatch = pathname.match(PRODUCT_ROUTE);
    if (productMatch) {
      const productId = decodeURIComponent(productMatch[1]);
      const product = await convex.query<PublicProduct & { images?: string[] }>(
        'products:getProduct',
        { productId }
      );
      if (!product) return { status: 404, meta: notFoundMeta() };
      const firstImage = product.images?.[0];
      const imageUrls = firstImage
        ? await convex.query<string[]>('products:getImageUrls', { storageIds: [firstImage] })
        : null;
      return { status: 200, meta: productMeta(product, imageUrls?.[0], siteUrl) };
    }

    return null;
  } catch (err) {
    if (err instanceof ConvexUnavailableError) {
      console.warn(`[seo] ${err.message}`);
      return null;
    }
    throw err;
  }
}

/** Sitemap with current public events and their products; null if Convex is unavailable. */
export async function resolveSitemap(
  convex: ConvexQueryClient,
  siteUrl: string
): Promise<string | null> {
  try {
    const events =
      (await convex.query<(SitemapEvent & { visibility?: string })[]>('events:get', {})) ?? [];
    const publicEvents = events.filter((event) => event.visibility === 'public');
    const products = new Map<string, SitemapProduct>();
    for (const event of publicEvents) {
      const eventProducts =
        (await convex.query<SitemapProduct[]>('eventProducts:getProductsForEvent', {
          eventId: event._id,
        })) ?? [];
      for (const product of eventProducts) products.set(product._id, product);
    }
    return buildSitemap(siteUrl, publicEvents, [...products.values()]);
  } catch (err) {
    if (err instanceof ConvexUnavailableError) {
      console.warn(`[sitemap] ${err.message}`);
      return null;
    }
    throw err;
  }
}
