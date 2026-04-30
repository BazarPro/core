import { test, expect } from '@playwright/test';

test('dashboard appearance', async ({ page }) => {
  await page.goto('/');

  /* Title */
  await expect(page).toHaveTitle(/BazarPro/);

  /* Login and register buttons*/
  await expect(page.getByTestId('header-button-login')).toBeVisible();

  /** gotta check how to run test only in desktop and tablet mode. Registration not available on mobile.. */
  await expect(page.getByTestId('header-button-register')).toBeVisible();
});
