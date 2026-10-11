import { test, expect } from '@playwright/test';
import { BUYER, login } from '../helpers/features';

/**
 * Marketing and legal pages are full width without the fixed sidebar, but logged-in
 * users can still open the menu from the header.
 */
const MARKETING_PAGES = [
  '/',
  '/features',
  '/pricing',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  '/imprint',
];

test('logged-in user can open the menu on marketing and legal pages', async ({ page }) => {
  // Visits eight pages; slow under full parallel load
  test.setTimeout(90_000);
  await login(page, BUYER);

  for (const path of MARKETING_PAGES) {
    await page.goto(path);
    await page.locator('[data-onboarding-id="header-mobile-menu"]').click();
    const menu = page.getByRole('dialog');
    await expect(menu, `menu on ${path}`).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Meine Produkte' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  }
});
