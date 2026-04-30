import { test, expect } from '@playwright/test';
import { runConvexCommand } from '../utils';

test.beforeAll('enable registration', async () => {
  runConvexCommand(
    'run featureFlags:set',
    `"{ 'key':'is_registration_enabled', 'value': true, 'description': 'Enables the registration page' }"`
  );
  runConvexCommand(
    'run featureFlags:set',
    `"{ 'key':'is_e2e_auth_skip_email', 'value': true, 'description': 'Skips SMTP delivery in E2E and stores auth verification codes for tests' }"`
  );
});

test('register-happy-path', async ({ page }, testInfo) => {
  const uniqueEmail = `e2e-register-${testInfo.project.name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}@bazarpro.de`;

  await page.goto('/register');

  await expect(page.getByTestId('register-form')).toBeVisible();
  await page.getByTestId('register-emailfield').fill(uniqueEmail);
  await page.getByTestId('register-password').click();
  await page.getByTestId('register-password').fill('Testpassword1!');

  const requirements = page.getByTestId('register-div-password-requirements');
  await expect(requirements).toBeVisible();
  await expect(requirements.locator('div', { hasText: '10+ Zeichen' })).toHaveClass(
    /text-green-600/
  );
  await expect(requirements.locator('div', { hasText: 'Großbuchstabe' })).toHaveClass(
    /text-green-600/
  );
  await expect(requirements.locator('div', { hasText: 'Kleinbuchstabe' })).toHaveClass(
    /text-green-600/
  );
  await expect(requirements.locator('div', { hasText: 'Zahl' })).toHaveClass(/text-green-600/);
  await expect(requirements.locator('div', { hasText: 'Sonderzeichen' })).toHaveClass(
    /text-green-600/
  );

  await page.getByTestId('register-password-confirm').click();
  await page.getByTestId('register-password-confirm').fill('Testpassword1!');
  await expect(page.getByText('Passwörter stimmen überein')).toBeVisible();

  await page.getByTestId('register-terms-checkbox').click();
  await expect(page.getByTestId('register-terms')).toBeVisible();
  await expect(page.getByTestId('register-terms-checkbox')).toBeChecked();
  await page.getByTestId('register-button-submit').click();

  await expect(page.getByTestId('form-email-verification')).toBeVisible();
  await expect(page.getByText(uniqueEmail)).toBeVisible();

  await page.getByLabel('Verifizierungscode').fill('000000');
  await page.getByRole('button', { name: 'E-Mail bestätigen' }).click();
  await expect(
    page.getByText('Der Code ist ungültig oder abgelaufen. Bitte fordere einen neuen Code an.')
  ).toBeVisible();

  confirmEmailForE2E(uniqueEmail);
});

function confirmEmailForE2E(email: string) {
  runConvexCommand('run users:confirmEmailForE2E', `"{ \\"email\\": \\"${email}\\" }"`);
}
