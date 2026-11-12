import { DEFAULT_LOCALE } from '../src/shared/constants.ts';
import { localizedAlternates } from '../src/shared/localizedRoutes.ts';
import { STATIC_PUBLIC_ROUTES } from './public-routes.ts';

export interface SitemapEvent {
  _id: string;
  startDate: number;
  visibility?: string;
}

export interface SitemapProduct {
  _id: string;
  updatedAt?: number;
}

function isoDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

interface Alternate {
  hreflang: string;
  href: string;
}

function urlEntry(
  loc: string,
  lastmod?: string,
  changefreq?: string,
  priority?: string,
  alternates: Alternate[] = []
): string {
  const parts = ['  <url>', `    <loc>${loc}</loc>`];
  for (const { hreflang, href } of alternates) {
    parts.push(`    <xhtml:link rel="alternate" hreflang="${hreflang}" href="${href}" />`);
  }
  if (lastmod) parts.push(`    <lastmod>${lastmod}</lastmod>`);
  if (changefreq) parts.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority) parts.push(`    <priority>${priority}</priority>`);
  parts.push('  </url>');
  return parts.join('\n');
}

/**
 * A page with an address per language gets one entry per language, each naming all
 * versions (hreflang, German also as x-default); other pages one plain entry.
 * Without `localized` only the German address.
 */
function staticEntries(
  siteUrl: string,
  route: string,
  changefreq: string,
  priority: string,
  localized: boolean
): string[] {
  const versions = localized ? localizedAlternates(route) : [];
  if (versions.length === 0)
    return [urlEntry(`${siteUrl}${route}`, undefined, changefreq, priority)];
  const alternates = versions.flatMap(({ locale, path }) => {
    const href = `${siteUrl}${path}`;
    return locale === DEFAULT_LOCALE
      ? [
          { hreflang: locale, href },
          { hreflang: 'x-default', href },
        ]
      : [{ hreflang: locale, href }];
  });
  return versions.map(({ path }) =>
    urlEntry(`${siteUrl}${path}`, undefined, changefreq, priority, alternates)
  );
}

export interface SitemapOptions {
  /** Static pages besides `/` */
  staticRoutes?: string[];
  /**
   * Whether the pages are listed in every language. A single-association instance shows
   * its own German content, so it lists the German addresses only.
   */
  localized?: boolean;
}

/**
 * Static pages carry no lastmod: a date that changes on every request (or never matches
 * a real change) makes search engines ignore lastmod for the whole sitemap.
 */
export function buildSitemap(
  siteUrl: string,
  events: SitemapEvent[],
  products: SitemapProduct[],
  { staticRoutes = STATIC_PUBLIC_ROUTES, localized = true }: SitemapOptions = {}
): string {
  const urls = [
    ...staticEntries(siteUrl, '/', 'weekly', '1.0', localized),
    ...staticRoutes.flatMap((route) => staticEntries(siteUrl, route, 'monthly', '0.5', localized)),
  ];
  for (const event of events) {
    const lastmod = isoDate(event.startDate);
    urls.push(urlEntry(`${siteUrl}/public-events/${event._id}`, lastmod, 'monthly', '0.8'));
    urls.push(
      urlEntry(`${siteUrl}/public-events/${event._id}/products`, lastmod, 'monthly', '0.7')
    );
  }
  for (const product of products) {
    const lastmod = product.updatedAt ? isoDate(product.updatedAt) : undefined;
    urls.push(urlEntry(`${siteUrl}/products/view/${product._id}`, lastmod, 'monthly', '0.6'));
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    urls.join('\n'),
    '</urlset>',
    '',
  ].join('\n');
}

export function buildRobotsTxt(siteUrl: string): string {
  return ['User-agent: *', 'Allow: /', `Sitemap: ${siteUrl}/sitemap.xml`, ''].join('\n');
}
