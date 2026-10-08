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

function urlEntry(loc: string, lastmod?: string, changefreq?: string, priority?: string): string {
  const parts = ['  <url>', `    <loc>${loc}</loc>`];
  if (lastmod) parts.push(`    <lastmod>${lastmod}</lastmod>`);
  if (changefreq) parts.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority) parts.push(`    <priority>${priority}</priority>`);
  parts.push('  </url>');
  return parts.join('\n');
}

export function buildSitemap(
  siteUrl: string,
  events: SitemapEvent[],
  products: SitemapProduct[],
  now = Date.now()
): string {
  const urls = [urlEntry(`${siteUrl}/`, isoDate(now), 'weekly', '1.0')];
  for (const route of STATIC_PUBLIC_ROUTES) {
    urls.push(urlEntry(`${siteUrl}${route}`, undefined, 'monthly', '0.5'));
  }
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
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls.join('\n'),
    '</urlset>',
    '',
  ].join('\n');
}

export function buildRobotsTxt(siteUrl: string): string {
  return ['User-agent: *', 'Allow: /', `Sitemap: ${siteUrl}/sitemap.xml`, ''].join('\n');
}
