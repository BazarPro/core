import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { ConvexHttpClient } from 'convex/browser';
import dotenv from 'dotenv';

dotenv.config();

const DIST_DIR = path.resolve(process.cwd(), 'dist');
const SITE_URL_RAW =
  process.env.VITE_SITE_URL ||
  process.env.DOMAIN_NAME ||
  process.env.SITE_URL ||
  process.env.PUBLIC_URL;
const CONVEX_URL = process.env.VITE_CONVEX_URL || process.env.CONVEX_URL;

if (!SITE_URL_RAW) {
  console.error('Missing VITE_SITE_URL, DOMAIN_NAME, SITE_URL, or PUBLIC_URL for sitemap.');
  process.exit(1);
}

if (!CONVEX_URL) {
  console.error('Missing VITE_CONVEX_URL or CONVEX_URL for sitemap.');
  process.exit(1);
}

function normalizeSiteUrl(value) {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

const SITE_URL = normalizeSiteUrl(SITE_URL_RAW);

function toAbsolute(pathname) {
  if (!pathname.startsWith('/')) return `${SITE_URL}/${pathname}`;
  return `${SITE_URL}${pathname}`;
}

function buildUrlEntry(loc, lastmod, changefreq, priority) {
  const parts = [`  <url>`, `    <loc>${loc}</loc>`];
  if (lastmod) parts.push(`    <lastmod>${lastmod}</lastmod>`);
  if (changefreq) parts.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority) parts.push(`    <priority>${priority}</priority>`);
  parts.push('  </url>');
  return parts.join('\n');
}

async function fetchPublicEvents(convex) {
  const events = await convex.query('events:get', {});
  return (events || []).filter((event) => event.visibility === 'public');
}

async function fetchProductsForEvent(convex, eventId) {
  const products = await convex.query('eventProducts:getProductsForEvent', { eventId });
  return products || [];
}

async function main() {
  const convex = new ConvexHttpClient(CONVEX_URL);
  const events = await fetchPublicEvents(convex);
  const productMap = new Map();

  for (const event of events) {
    const products = await fetchProductsForEvent(convex, event._id);
    for (const product of products) {
      if (!productMap.has(product._id)) {
        productMap.set(product._id, product);
      }
    }
  }

  const urls = [];
  urls.push(
    buildUrlEntry(
      toAbsolute('/'),
      new Date().toISOString().slice(0, 10),
      'weekly',
      '1.0'
    )
  );

  for (const event of events) {
    const lastmod = new Date(event.startDate).toISOString().slice(0, 10);
    urls.push(
      buildUrlEntry(
        toAbsolute(`/public-events/${event._id}`),
        lastmod,
        'monthly',
        '0.8'
      )
    );
    urls.push(
      buildUrlEntry(
        toAbsolute(`/public-events/${event._id}/products`),
        lastmod,
        'monthly',
        '0.7'
      )
    );
  }

  for (const product of productMap.values()) {
    const lastmod = product.updatedAt
      ? new Date(product.updatedAt).toISOString().slice(0, 10)
      : undefined;
    urls.push(
      buildUrlEntry(
        toAbsolute(`/products/view/${product._id}`),
        lastmod,
        'monthly',
        '0.6'
      )
    );
  }

  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls.join('\n'),
    '</urlset>',
    '',
  ].join('\n');

  const robots = [
    'User-agent: *',
    'Allow: /',
    `Sitemap: ${toAbsolute('/sitemap.xml')}`,
    '',
  ].join('\n');

  await mkdir(DIST_DIR, { recursive: true });
  await writeFile(path.join(DIST_DIR, 'sitemap.xml'), sitemap, 'utf8');
  await writeFile(path.join(DIST_DIR, 'robots.txt'), robots, 'utf8');

  console.log(`Wrote sitemap.xml and robots.txt to ${DIST_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
