import { spawn } from 'node:child_process';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';
import dotenv from 'dotenv';
import { STATIC_PUBLIC_ROUTES } from '../server/public-routes.ts';

dotenv.config();

const DIST_DIR = path.resolve(process.cwd(), 'dist');
const PREVIEW_PORT = process.env.PRERENDER_PORT || '4173';
const BASE_URL = process.env.PRERENDER_BASE_URL || `http://127.0.0.1:${PREVIEW_PORT}`;
const SKIP_PREVIEW = process.env.PRERENDER_SKIP_PREVIEW === '1';
// Set PRERENDER_STRICT=1 to fail the build instead of shipping the plain SPA
const STRICT = process.env.PRERENDER_STRICT === '1';

function skipPrerender(reason) {
  if (STRICT) {
    console.error(reason);
    process.exit(1);
  }
  console.warn(`WARNING: Skipping prerender, serving the plain SPA instead. ${reason}`);
  process.exit(0);
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
    // Own process group, so stopPreviewServer() also ends the vite child of npm
    { stdio: 'inherit', detached: process.platform !== 'win32' }
  );
  return child;
}

function stopPreviewServer(child) {
  if (process.platform === 'win32') {
    child.kill('SIGTERM');
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // already exited
  }
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
  // Keep the unrendered shell as SPA fallback (server/index.ts serves it for all routes
  // without a prerendered file). index.html becomes the prerendered landing page.
  await copyFile(path.join(DIST_DIR, 'index.html'), path.join(DIST_DIR, 'spa.html'));

  // Event and product pages are not prerendered: server/index.ts adds their
  // metadata at request time, so they are never stale.
  // '/' last: it overwrites index.html, which the preview server uses as fallback
  const routes = [...STATIC_PUBLIC_ROUTES, '/'];

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
      stopPreviewServer(previewProcess);
    }
  }
}

main().catch((err) => {
  skipPrerender(err instanceof Error ? (err.stack ?? err.message) : String(err));
});
