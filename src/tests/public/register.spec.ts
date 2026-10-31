import { test, expect } from '@playwright/test';
import { runBackend } from '../utils';

test.beforeAll('enable registration', async () => {
  runBackend('featureFlags.set', {
    key: 'is_registration_enabled',
    value: true,
    description: 'Enables the registration page',
  });
  runBackend('featureFlags.set', {
    key: 'is_e2e_auth_skip_email',
    value: true,
    description: 'Skips SMTP delivery in E2E and stores auth verification codes for tests',
  });
});

test('register-happy-path', async ({ page }, testInfo) => {
  const uniqueEmail = `e2e-register-${testInfo.project.name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}@bazarpro.de`;

  await page.goto('/register');

  await expect(page.getByTestId('register-form')).toBeVisible();
  await page.getByTestId('register-emailfield').fill(uniqueEmail);
  await page.getByTestId('register-password').fill('Testpassword1!');
  await expect(page.getByText('Mindestens 10 Zeichen')).toBeVisible();
  await expect(page.getByTestId('register-terms')).toContainText('Nutzungsbedingungen');
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
  runBackend('users.confirmEmailForE2E', { email });
}
