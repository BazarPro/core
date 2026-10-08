import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { ConvexHttpClient } from 'convex/browser';
import dotenv from 'dotenv';
import { buildRobotsTxt, buildSitemap } from '../server/sitemap.ts';

dotenv.config();

// Build-time fallback. In production server/index.ts serves a live sitemap and
// only uses this file when Convex is unreachable.

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

function normalizeSiteUrl(value) {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

const SITE_URL = normalizeSiteUrl(SITE_URL_RAW);

async function fetchPublicContent() {
  if (!CONVEX_URL) {
    throw new Error('Missing VITE_CONVEX_URL or CONVEX_URL for sitemap.');
  }
  const convex = new ConvexHttpClient(CONVEX_URL);
  const events = ((await convex.query('events:get', {})) || []).filter(
    (event) => event.visibility === 'public'
  );
  const products = new Map();
  for (const event of events) {
    const eventProducts =
      (await convex.query('eventProducts:getProductsForEvent', { eventId: event._id })) || [];
    for (const product of eventProducts) products.set(product._id, product);
  }
  return { events, products: [...products.values()] };
}

async function main() {
  let events = [];
  let products = [];
  try {
    ({ events, products } = await fetchPublicContent());
  } catch (err) {
    if (process.env.PRERENDER_STRICT === '1') throw err;
    console.warn(
      `WARNING: Could not load public content, writing sitemap with static pages only. ${err}`
    );
  }

  await mkdir(DIST_DIR, { recursive: true });
  await writeFile(path.join(DIST_DIR, 'sitemap.xml'), buildSitemap(SITE_URL, events, products));
  await writeFile(path.join(DIST_DIR, 'robots.txt'), buildRobotsTxt(SITE_URL));

  console.log(`Wrote sitemap.xml and robots.txt to ${DIST_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
