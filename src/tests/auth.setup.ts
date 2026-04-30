import { test as setup, expect } from '@playwright/test';
// import path from 'path';

setup('authenticate', async ({ page }) => {
  // Perform authentication steps. Replace these actions with your own.
  await page.goto('/login');

  await page.getByRole('textbox', { name: 'E-Mail-Adresse' }).fill('user1@bazarpro.de');
  await page.getByRole('textbox', { name: 'Passwort' }).fill('123456');
  await page.getByTestId('button-login-submit').click();

  // Wait until the page receives the cookies.
  //
  // Sometimes login flow sets cookies in the process of several redirects.
  // Wait for the final URL to ensure that the cookies are actually set.
  await page.waitForURL('/browse-events');
  // Use a stable authenticated UI marker instead of a specific display name.
  await expect(page.getByTestId('header-user-menu')).toBeVisible();

  // End of authentication steps.

  await page.context().storageState({ path: 'playwright/.auth/user.json' });
});
