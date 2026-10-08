import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer as createHttpServer, type IncomingMessage, type Server } from 'node:http';
import type { ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';
import { createConvexClient, type ConvexQueryClient } from './convex.ts';
import { isDynamicRoute, resolvePage, resolveSitemap } from './pages.ts';
import { injectHead } from './seo.ts';

/**
 * Production web server for the frontend. Serves the Vite build like the
 * previous nginx config (prerendered pages, SPA shell fallback, immutable
 * assets) and adds server-side SEO for data-driven public pages and a live
 * sitemap.
 */

export interface ServerOptions {
  distDir: string;
  siteUrl: string;
  convex: ConvexQueryClient | null;
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json',
};

const COMPRESSIBLE = /^(text\/|application\/(json|xml|manifest\+json)|image\/svg\+xml)/;
const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache';

function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

function acceptsGzip(req: IncomingMessage): boolean {
  return /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
}

function send(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  contentType: string,
  cacheControl: string,
  body: string
) {
  const gzip = COMPRESSIBLE.test(contentType) && acceptsGzip(req);
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
    Vary: 'Accept-Encoding',
    ...(gzip ? { 'Content-Encoding': 'gzip' } : { 'Content-Length': Buffer.byteLength(body) }),
  });
  if (req.method === 'HEAD') return res.end();
  if (!gzip) return res.end(body);
  const stream = createGzip();
  stream.pipe(res);
  stream.end(body);
}

async function sendFile(
  req: IncomingMessage,
  res: ServerResponse,
  filePath: string,
  size: number,
  cacheControl: string
) {
  const contentType = contentTypeFor(filePath);
  const gzip = COMPRESSIBLE.test(contentType) && acceptsGzip(req);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
    Vary: 'Accept-Encoding',
    ...(gzip ? { 'Content-Encoding': 'gzip' } : { 'Content-Length': size }),
  });
  if (req.method === 'HEAD') return res.end();
  const stream = createReadStream(filePath);
  if (gzip) stream.pipe(createGzip()).pipe(res);
  else stream.pipe(res);
}

/** Resolves a URL path inside distDir; null for paths escaping it. */
function resolveInDist(distDir: string, urlPath: string): string | null {
  const resolved = path.resolve(distDir, `.${urlPath}`);
  return resolved === distDir || resolved.startsWith(`${distDir}${path.sep}`) ? resolved : null;
}

async function findFile(filePath: string | null): Promise<{ path: string; size: number } | null> {
  if (!filePath) return null;
  try {
    const info = await stat(filePath);
    if (info.isFile()) return { path: filePath, size: info.size };
    if (info.isDirectory()) {
      const index = path.join(filePath, 'index.html');
      const indexInfo = await stat(index);
      if (indexInfo.isFile()) return { path: index, size: indexInfo.size };
    }
  } catch {
    // not found
  }
  return null;
}

export async function createServer({ distDir, siteUrl, convex }: ServerOptions): Promise<Server> {
  const root = path.resolve(distDir);
  // spa.html is the unrendered shell; index.html is the prerendered landing page
  const shellHtml = await readFile(path.join(root, 'spa.html'), 'utf8').catch(() =>
    readFile(path.join(root, 'index.html'), 'utf8')
  );

  return createHttpServer(async (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
      }

      let pathname: string;
      try {
        pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
      } catch {
        res.writeHead(400).end();
        return;
      }

      if (pathname === '/healthz') {
        send(req, res, 200, 'text/plain; charset=utf-8', REVALIDATE, 'ok');
        return;
      }

      if (pathname === '/sitemap.xml' && convex) {
        const sitemap = await resolveSitemap(convex, siteUrl);
        if (sitemap) {
          send(req, res, 200, CONTENT_TYPES['.xml'], 'public, max-age=300', sitemap);
          return;
        }
        // Convex unavailable: fall through to the sitemap generated at build time
      }

      if (isDynamicRoute(pathname)) {
        const page = convex ? await resolvePage(pathname, convex, siteUrl) : null;
        const html = page ? injectHead(shellHtml, page.meta) : shellHtml;
        send(req, res, page?.status ?? 200, CONTENT_TYPES['.html'], REVALIDATE, html);
        return;
      }

      const file = await findFile(resolveInDist(root, pathname));
      if (file) {
        const cacheControl = pathname.startsWith('/assets/') ? IMMUTABLE : REVALIDATE;
        await sendFile(req, res, file.path, file.size, cacheControl);
        return;
      }

      if (pathname.startsWith('/assets/') || path.extname(pathname)) {
        send(req, res, 404, 'text/plain; charset=utf-8', REVALIDATE, 'Not found');
        return;
      }

      // Client-side route: the SPA decides what to render
      send(req, res, 200, CONTENT_TYPES['.html'], REVALIDATE, shellHtml);
    } catch (err) {
      console.error('[server] request failed', req.url, err);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
}

async function main() {
  const port = Number(process.env.PORT ?? 8080);
  const distDir = process.env.DIST_DIR ?? fileURLToPath(new URL('../dist', import.meta.url));
  const siteUrl = (process.env.SITE_URL ?? 'https://bazarpro.de').replace(/\/+$/, '');
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) {
    console.warn('[server] CONVEX_URL not set, serving without server-side SEO');
  }

  const server = await createServer({
    distDir,
    siteUrl,
    convex: convexUrl ? createConvexClient(convexUrl) : null,
  });
  server.listen(port, () => console.log(`[server] listening on :${port} (site ${siteUrl})`));

  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main();
}
