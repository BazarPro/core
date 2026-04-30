import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';
import { ConvexHttpClient } from 'convex/browser';
import dotenv from 'dotenv';

dotenv.config();

const DIST_DIR = path.resolve(process.cwd(), 'dist');
const PREVIEW_PORT = process.env.PRERENDER_PORT || '4173';
const BASE_URL = process.env.PRERENDER_BASE_URL || `http://127.0.0.1:${PREVIEW_PORT}`;
const CONVEX_URL = process.env.VITE_CONVEX_URL || process.env.CONVEX_URL;
const SKIP_PREVIEW = process.env.PRERENDER_SKIP_PREVIEW === '1';

if (!CONVEX_URL) {
  console.error('Missing VITE_CONVEX_URL or CONVEX_URL for prerender.');
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, retries = 40) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.ok) return;
    } catch (err) {
      // ignore and retry
    }
    await sleep(250);
  }
  throw new Error(`Preview server not ready at ${url}`);
}

function startPreviewServer() {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(
    npmCommand,
    ['run', 'preview', '--', '--host', '127.0.0.1', '--port', PREVIEW_PORT],
    { stdio: 'inherit' }
  );
  return child;
}

async function fetchPublicEvents(convex) {
  const events = await convex.query('events:get', {});
  return (events || []).filter((event) => event.visibility === 'public');
}

async function fetchProductsForEvent(convex, eventId) {
  const products = await convex.query('eventProducts:getProductsForEvent', { eventId });
  return products || [];
}

function toOutputPath(route) {
  if (route === '/' || route === '') {
    return path.join(DIST_DIR, 'index.html');
  }
  const trimmed = route.replace(/^\/+/, '');
  return path.join(DIST_DIR, trimmed, 'index.html');
}

async function prerenderRoute(page, route) {
  const targetUrl = `${BASE_URL}${route}`;
  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const html = await page.content();
  const outputPath = toOutputPath(route);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, 'utf8');
  return outputPath;
}

async function main() {
  const convex = new ConvexHttpClient(CONVEX_URL);
  const events = await fetchPublicEvents(convex);
  const productIds = new Set();

  for (const event of events) {
    const products = await fetchProductsForEvent(convex, event._id);
    for (const product of products) {
      productIds.add(product._id);
    }
  }

  const routes = new Set(['/']);
  for (const event of events) {
    routes.add(`/public-events/${event._id}`);
    routes.add(`/public-events/${event._id}/products`);
  }
  for (const productId of productIds) {
    routes.add(`/products/view/${productId}`);
  }

  let previewProcess;
  try {
    if (!SKIP_PREVIEW) {
      previewProcess = startPreviewServer();
      await waitForServer(`${BASE_URL}/`);
    }

    const browser = await chromium.launch();
    const page = await browser.newPage();
    for (const route of routes) {
      const outputPath = await prerenderRoute(page, route);
      console.log(`Prerendered ${route} -> ${outputPath}`);
    }
    await browser.close();
  } finally {
    if (previewProcess) {
      previewProcess.kill('SIGTERM');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
