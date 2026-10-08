import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConvexUnavailableError, type ConvexQueryClient } from './convex.ts';
import { createServer } from './index.ts';

const SHELL = `<!doctype html><html><head><meta name="description" content="Default" /><title>BazarPro</title></head><body><div id="root"></div></body></html>`;

const EVENT = {
  _id: 'evt1',
  title: 'Fahrradbasar',
  description: 'Räder',
  location: 'Ulm',
  startDate: Date.UTC(2026, 10, 7, 9),
  endDate: Date.UTC(2026, 10, 7, 15),
  visibility: 'public',
};

/** Fake Convex: knows evt1 and product p1; 'down' simulates an outage. */
const fakeConvex: ConvexQueryClient = {
  async query<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
    if (args.id === 'down' || args.productId === 'down') {
      throw new ConvexUnavailableError('down');
    }
    const result: Record<string, unknown> = {
      'events:getPublicEventForViewer': args.id === 'evt1' ? EVENT : null,
      'events:get': [EVENT, { ...EVENT, _id: 'private1', visibility: 'private' }],
      'eventProducts:getProductsForEvent': [{ _id: 'p1', updatedAt: Date.UTC(2026, 9, 1) }],
      'products:getProduct':
        args.productId === 'p1'
          ? { _id: 'p1', title: 'Rennrad', description: 'Top', price: 99, images: ['s1'] }
          : null,
      'products:getImageUrls': ['https://img/p1.jpg'],
    };
    return (result[fn] ?? null) as T | null;
  },
};

let distDir: string;
let server: Server;
let baseUrl: string;

async function get(pathname: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${pathname}`, init);
  return { response, body: await response.text() };
}

beforeAll(async () => {
  distDir = await mkdtemp(path.join(tmpdir(), 'bazarpro-dist-'));
  await mkdir(path.join(distDir, 'assets'));
  await mkdir(path.join(distDir, 'features'));
  await writeFile(path.join(distDir, 'spa.html'), SHELL);
  await writeFile(path.join(distDir, 'index.html'), '<html><title>Landing</title></html>');
  await writeFile(path.join(distDir, 'features', 'index.html'), '<title>Features</title>');
  await writeFile(path.join(distDir, 'assets', 'app-123.js'), 'console.log("app");');
  await writeFile(path.join(distDir, 'sitemap.xml'), '<urlset>static</urlset>');
  await writeFile(path.join(tmpdir(), 'bazarpro-secret.txt'), 'secret');

  server = await createServer({ distDir, siteUrl: 'https://bazarpro.de', convex: fakeConvex });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(distDir, { recursive: true, force: true });
});

describe('static files', () => {
  it('serves the prerendered landing page and static pages', async () => {
    expect((await get('/')).body).toContain('Landing');
    const features = await get('/features');
    expect(features.response.status).toBe(200);
    expect(features.body).toContain('Features');
    expect(features.response.headers.get('cache-control')).toBe('no-cache');
  });

  it('serves hashed assets as immutable and 404s missing ones', async () => {
    const asset = await get('/assets/app-123.js');
    expect(asset.response.headers.get('cache-control')).toContain('immutable');
    expect(asset.response.headers.get('content-type')).toContain('text/javascript');
    expect((await get('/assets/missing.js')).response.status).toBe(404);
    expect((await get('/favicon.ico')).response.status).toBe(404);
  });

  it('falls back to the SPA shell for client-side routes', async () => {
    const page = await get('/browse-events');
    expect(page.response.status).toBe(200);
    expect(page.body).toBe(SHELL);
  });

  it('does not serve files outside the dist directory', async () => {
    const page = await get('/..%2Fbazarpro-secret.txt');
    expect(page.body).not.toContain('secret');
  });

  it('compresses text responses when the client accepts gzip', async () => {
    const response = await fetch(`${baseUrl}/assets/app-123.js`, {
      headers: { 'Accept-Encoding': 'gzip' },
    });
    // fetch decompresses transparently; the header shows the wire encoding
    expect(response.headers.get('content-encoding')).toBe('gzip');
    expect(await response.text()).toContain('console.log');
  });

  it('answers HEAD without body and rejects other methods', async () => {
    const head = await fetch(`${baseUrl}/features`, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    expect((await fetch(`${baseUrl}/`, { method: 'POST' })).status).toBe(405);
  });

  it('reports health', async () => {
    expect((await get('/healthz')).body).toBe('ok');
  });
});

describe('server-side SEO', () => {
  it('injects event metadata into the shell', async () => {
    const page = await get('/public-events/evt1');
    expect(page.response.status).toBe(200);
    expect(page.body).toContain('<title>Fahrradbasar in Ulm | BazarPro</title>');
    expect(page.body).toContain('href="https://bazarpro.de/public-events/evt1"');
    expect(page.body).toContain('<div id="root"></div>');
  });

  it('injects metadata for the event products page', async () => {
    const page = await get('/public-events/evt1/products');
    expect(page.body).toContain('Angebote bei Fahrradbasar in Ulm');
  });

  it('injects product metadata with image', async () => {
    const page = await get('/products/view/p1');
    expect(page.body).toContain('<title>Rennrad | BazarPro</title>');
    expect(page.body).toContain('content="https://img/p1.jpg"');
  });

  it('returns 404 with noindex for unknown events and products', async () => {
    for (const pathname of ['/public-events/nope', '/products/view/nope']) {
      const page = await get(pathname);
      expect(page.response.status).toBe(404);
      expect(page.body).toContain('noindex, nofollow');
      expect(page.body).toContain('<div id="root"></div>');
    }
  });

  it('serves the plain shell with 200 when Convex is unavailable', async () => {
    for (const pathname of ['/public-events/down', '/products/view/down']) {
      const page = await get(pathname);
      expect(page.response.status).toBe(200);
      expect(page.body).toBe(SHELL);
    }
  });

  it('serves a live sitemap with public events and their products', async () => {
    const response = await fetch(`${baseUrl}/sitemap.xml`, {
      headers: { 'Accept-Encoding': 'identity' },
    });
    const body = await response.text();
    expect(response.headers.get('content-type')).toContain('application/xml');
    expect(body).toContain('https://bazarpro.de/public-events/evt1</loc>');
    expect(body).toContain('https://bazarpro.de/products/view/p1</loc>');
    expect(body).toContain('https://bazarpro.de/imprint</loc>');
    expect(body).not.toContain('private1');
  });
});

describe('without Convex', () => {
  it('serves the static sitemap and plain shell', async () => {
    const plain = await createServer({ distDir, siteUrl: 'https://bazarpro.de', convex: null });
    await new Promise<void>((resolve) => plain.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(plain.address() as AddressInfo).port}`;
    try {
      expect(await (await fetch(`${url}/sitemap.xml`)).text()).toBe('<urlset>static</urlset>');
      expect(await (await fetch(`${url}/public-events/evt1`)).text()).toBe(SHELL);
    } finally {
      await new Promise((resolve) => plain.close(resolve));
    }
  });
});
