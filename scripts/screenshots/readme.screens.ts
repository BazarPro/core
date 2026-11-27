import { test, expect, type Page } from '@playwright/test';
/** src/i18n: the language a visitor chose */
const LANGUAGE_STORAGE_KEY = 'bazarpro.language';

/**
 * The screenshots of the README (docs/screenshots/). Not a test: run with
 * `npm run screenshots`. Organizer: Sarah Miller and her running kids' bazaar from the
 * English demo data (backend/src/demo).
 */
const OUT = 'docs/screenshots';
const ORGANIZER = 'sarah.miller@example.org';
const SELLER = 'laura.bennett@example.org';
const BAZAAR = "Sunshine Nursery Kids' Bazaar";

// In order: the phone shots open the bazaar found by the organizer
test.describe.configure({ mode: 'serial' });
let bazaarPath = '';

/** src/components/ui/theme-provider.tsx: the theme the user chose */
const THEME_STORAGE_KEY = 'bazarpro-theme';
let suffix = '';

test.beforeEach(async ({ page }, testInfo) => {
  const theme = testInfo.project.name === 'dark' ? 'dark' : 'light';
  suffix = theme === 'dark' ? '-dark' : '';
  await page.addInitScript(
    ([languageKey, themeKey, value]) => {
      window.localStorage.setItem(languageKey, 'en');
      window.localStorage.setItem(themeKey, value);
    },
    [LANGUAGE_STORAGE_KEY, THEME_STORAGE_KEY, theme]
  );
});

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('123456');
  await page.getByTestId('button-login-submit').click();
  await page.waitForURL((url) => url.pathname === '/');
}

/** Waits for images and fonts, then saves the visible page. */
async function shot(page: Page, name: string) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    await document.fonts.ready;
    // Lazy images below the fold never load
    await Promise.all(
      [...document.images]
        .filter((img) => !img.complete && img.loading !== 'lazy')
        .map((img) => new Promise((done) => img.addEventListener('load', done, { once: true })))
    );
  });
  // Animations and the focus ring of inputs settle
  await page.waitForTimeout(500);
  // JPEG: a quarter of the size of a PNG with the photos of the demo data
  await page.screenshot({
    path: `${OUT}/${name}${suffix}.jpg`,
    type: 'jpeg',
    quality: 85,
    animations: 'disabled',
    caret: 'hide',
  });
}

/** The organizer's bazaar overview; returns its address. */
async function openBazaar(page: Page) {
  await signIn(page, ORGANIZER);
  const organize = page.getByRole('button', { name: 'Organize' });
  await expect(async () => {
    await organize.click();
    await expect(organize).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 });
  }).toPass();
  // All bazaars of the organizer; `/` itself opens the chosen one
  await page.goto('/my-events');
  const href = await page.getByRole('link', { name: BAZAAR }).first().getAttribute('href');
  await page.goto(href!);
  return href!;
}

test('landing page', async ({ page }) => {
  await page.goto('/en');
  await shot(page, 'landing');
});

test('organizer: overview, items, cash desk, settlement', async ({ page }) => {
  const bazaar = await openBazaar(page);
  bazaarPath = bazaar;
  await shot(page, 'organizer-overview');

  await page.goto(`${bazaar}/products`);
  await expect(page.getByRole('button', { name: 'To cash desk' }).first()).toBeVisible();
  await shot(page, 'organizer-items');

  // Three items on sale into the cart, as if scanned; each one opens the cash desk
  for (let i = 0; i < 3; i++) {
    await page.goto(`${bazaar}/products`);
    await page.getByRole('tab', { name: /Sale/ }).click();
    await page.getByRole('button', { name: 'To cash desk' }).nth(i).click();
    await page.waitForURL(/\/checkout$/);
  }
  await expect(page.getByText('The cart is empty')).toBeHidden();
  await page.locator('body').click({ position: { x: 5, y: 790 } });
  await shot(page, 'cash-desk');

  await page.goto(`${bazaar}/cash`);
  await shot(page, 'settlement');
});

test.describe('phone', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  test('seller: my items', async ({ page }) => {
    await signIn(page, SELLER);
    await page.goto('/my-products');
    await shot(page, 'seller-items-phone');
  });

  test('visitor: catalog of a bazaar', async ({ page }) => {
    const id = bazaarPath.split('/').pop()!;
    await page.goto(`/public-events/${id}/products`);
    await shot(page, 'catalog-phone');
  });
});
