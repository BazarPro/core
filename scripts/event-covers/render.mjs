// Renders the scenes to public/images/covers/<id>.webp: node scripts/event-covers/render.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const output = resolve('public/images/covers');
mkdirSync(output, { recursive: true });

const server = await createServer({ server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto('http://localhost:5199/scripts/event-covers/index.html');
await page.waitForSelector('[data-cover]');

for (const cover of await page.locator('[data-cover]').all()) {
  const id = await cover.getAttribute('data-cover');
  const png = (await cover.screenshot()).toString('base64');
  const webp = await page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d').drawImage(image, 0, 0);
    return canvas.toDataURL('image/webp', 0.85).split(',')[1];
  }, png);
  writeFileSync(resolve(output, `${id}.webp`), Buffer.from(webp, 'base64'));
  console.log(id, Math.round((webp.length * 0.75) / 1024), 'KB');
}

await browser.close();
await server.close();
