// Renders the app icon and the splash screens from the BazarPro mark (BrandMark.tsx):
// node scripts/app-assets/render.mjs
// Writes assets/*.svg (sources) and every PNG of Android (res/mipmap*, res/drawable*) and
// iOS (AppIcon, Splash) in the sizes that are already there.
import { readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BLUE = '#1d4ed8';
const TAG = '#f6c445';
const DARK = '#0b1120';
// The full mark of BrandMark.tsx in its 40x40 box: the tag (with hole and "B") and the string
const TAG_PATH =
  'M16 6h17a4 4 0 0 1 4 4v22a4 4 0 0 1-4 4H16l-9.2-12.1a3.2 3.2 0 0 1 0-3.8ZM12.6 17.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4ZM19 12.5h7.2a4.1 4.1 0 0 1 3 6.9 4.4 4.4 0 0 1-2.7 8.1H19Zm3 2.6v3.7h3.8a1.85 1.85 0 0 0 0-3.7Zm0 6.2v3.6h4.4a1.8 1.8 0 0 0 0-3.6Z';
const STRING_PATH = 'M12.8 22.7C7.6 19.6 4.4 12.4 7.6 4.4';
// Visual centre of the mark (with string) in its box, so it sits in the middle
const CX = 21.5;
const CY = 20;

/** An SVG of `w`x`h` with the mark `size` px wide in the middle. */
function svg({ w, h, size, bg, tag, string, circle = false }) {
  const s = size / 40;
  const ground = !bg
    ? ''
    : circle
      ? `<circle cx="${w / 2}" cy="${h / 2}" r="${w / 2}" fill="${bg}"/>`
      : `<rect width="${w}" height="${h}" fill="${bg}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${ground}<g transform="translate(${w / 2 - CX * s} ${h / 2 - CY * s}) scale(${s})"><path fill="${tag}" fill-rule="evenodd" transform="rotate(-12 21 21)" d="${TAG_PATH}"/><path fill="none" stroke="${string}" stroke-width="2.6" stroke-linecap="round" d="${STRING_PATH}"/></g></svg>`;
}

// On blue: a white tag, the "B" punched out in blue, the yellow string
const onBlue = { tag: '#ffffff', string: TAG };
const light = { bg: '#ffffff', tag: BLUE, string: TAG };
const dark = { bg: DARK, tag: TAG, string: '#ffffff' };

const icon = (n) => svg({ w: n, h: n, size: n * 0.6, bg: BLUE, ...onBlue });
const round = (n) => svg({ w: n, h: n, size: n * 0.56, bg: BLUE, circle: true, ...onBlue });
// Adaptive icon: only the middle 66 % is always visible
const foreground = (n) => svg({ w: n, h: n, size: n * 0.4, ...onBlue });
const splash = (w, h, theme) => svg({ w, h, size: Math.max(w, h) * 0.125, ...theme });
const splashSquare = (n, theme) => svg({ w: n, h: n, size: n * 0.15, ...theme });

const jobs = [];
writeFileSync('assets/icon-only.svg', icon(1024));
writeFileSync('assets/icon-foreground.svg', foreground(1024));
writeFileSync('assets/splash.svg', splashSquare(2732, light));
writeFileSync('assets/splash-dark.svg', splashSquare(2732, dark));
jobs.push(['assets/icon-only.png', icon(1024)], ['assets/icon-foreground.png', foreground(1024)]);
jobs.push(
  ['assets/splash.png', splashSquare(2732, light)],
  ['assets/splash-dark.png', splashSquare(2732, dark)]
);

const res = 'android/app/src/main/res';
const sizes = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, f] of Object.entries(sizes)) {
  jobs.push([`${res}/mipmap-${d}/ic_launcher.png`, icon(48 * f)]);
  jobs.push([`${res}/mipmap-${d}/ic_launcher_round.png`, round(48 * f)]);
  jobs.push([`${res}/mipmap-${d}/ic_launcher_foreground.png`, foreground(108 * f)]);
}
// Splash screens: the size is read from the file name of the folder (land/port, night)
const SPLASH = {
  mdpi: [480, 320],
  hdpi: [800, 480],
  xhdpi: [1280, 720],
  xxhdpi: [1600, 960],
  xxxhdpi: [1920, 1280],
};
for (const dir of readdirSync(res).filter((d) => d.startsWith('drawable'))) {
  const file = join(res, dir, 'splash.png');
  if (!existsSync(file)) continue;
  const theme = dir.includes('night') ? dark : light;
  const density = dir.match(/(x*hdpi|mdpi)$/)?.[1] ?? 'mdpi';
  let [w, h] = SPLASH[density];
  if (dir.includes('port')) [w, h] = [h, w];
  jobs.push([file, splash(w, h, theme)]);
}
const ios = 'ios/App/App/Assets.xcassets';
jobs.push([`${ios}/AppIcon.appiconset/AppIcon-512@2x.png`, icon(1024)]);
for (const n of ['', '-1', '-2']) {
  jobs.push([`${ios}/Splash.imageset/splash-2732x2732${n}.png`, splashSquare(2732, light)]);
  jobs.push([`${ios}/Splash.imageset/splash-2732x2732-dark${n}.png`, splashSquare(2732, dark)]);
}
// The logo of the structured data (public/logo.png): the mark on a transparent ground
jobs.push(['public/logo.png', svg({ w: 512, h: 512, size: 440, ...light, bg: undefined })]);

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, source] of jobs) {
  const [, w, h] = source.match(/width="([\d.]+)" height="([\d.]+)"/).map(Number);
  await page.setViewportSize({ width: Math.round(w), height: Math.round(h) });
  await page.setContent(`<style>*{margin:0}</style>${source}`);
  await page.locator('svg').screenshot({ path: file, omitBackground: true });
  console.log(file);
}
await browser.close();
