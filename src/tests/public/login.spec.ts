import { test, expect } from '@playwright/test';

test('login-happypath', async ({ page }) => {
  await page.goto('/login');

  await expect(page.getByTestId('form-login')).toBeVisible();
  await expect(page.getByTestId('field-login-email')).toBeVisible();
  await expect(page.getByTestId('field-login-password')).toBeVisible();
  await expect(page.getByTestId('button-login-submit')).toBeVisible();
  await expect(page.getByTestId('login-div-oauth')).toBeVisible();
  await expect(page.getByTestId('div-login-register')).toBeVisible();

  await page.getByRole('textbox', { name: 'E-Mail-Adresse' }).fill('user1@bazarpro.de');
  await page.getByRole('textbox', { name: 'Passwort' }).fill('123456');
  await expect(page.getByTestId('alert-wrong-login')).not.toBeVisible();
  await page.getByTestId('button-login-submit').click();
  await expect(page.getByTestId('header-user-menu')).toBeVisible();
});

test('login-wrong-credentials', async ({ page }) => {
  await page.goto('/login');

  await page.getByRole('textbox', { name: 'E-Mail-Adresse' }).fill('wrongmail@mail.de');
  await page.getByRole('textbox', { name: 'Passwort' }).fill('wrongpassword');
  await page.getByTestId('button-login-submit').click();
  await expect(page.getByTestId('alert-wrong-login')).toBeVisible();
});
