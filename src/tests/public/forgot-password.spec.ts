import { test, expect } from '@playwright/test';
import { runConvexCommand, runConvexCommandWithOutput } from '../utils';

test.beforeAll('enable registration and e2e mail bypass', async () => {
  runConvexCommand(
    'run featureFlags:set',
    `"{ 'key':'is_registration_enabled', 'value': true, 'description': 'Enables the registration page' }"`
  );
  runConvexCommand(
    'run featureFlags:set',
    `"{ 'key':'is_e2e_auth_skip_email', 'value': true, 'description': 'Skips SMTP delivery in E2E and stores auth verification codes for tests' }"`
  );
});

test('forgot-password flow works with e2e token store and handles invalid code', async ({
  page,
}, testInfo) => {
  const uniqueEmail = `e2e-reset-${testInfo.project.name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}@bazarpro.de`;
  const initialPassword = 'Testpassword1!';
  const newPassword = 'NeuesPasswort1!';

  // Create and verify a fresh user to avoid clashes with seeded users.
  await page.goto('/register');
  await page.getByTestId('register-emailfield').fill(uniqueEmail);
  await page.getByTestId('register-password').fill(initialPassword);
  await page.getByTestId('register-password-confirm').fill(initialPassword);
  await page.getByTestId('register-terms-checkbox').click();
  await page.getByTestId('register-button-submit').click();
  await expect(page.getByTestId('form-email-verification')).toBeVisible();

  confirmEmailForE2E(uniqueEmail);

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.waitForURL('**/login');
  await page.getByRole('button', { name: 'Passwort vergessen?' }).click();
  await expect(page.getByRole('heading', { name: 'Passwort vergessen?' })).toBeVisible();

  await page.locator('#resetEmail').fill(uniqueEmail);
  await page.getByRole('button', { name: 'Code anfordern' }).click();
  await expect(
    page.getByText('Wir haben einen Code an deine E-Mail-Adresse gesendet.')
  ).toBeVisible();

  // Invalid code must show frontend error message.
  await page.locator('#resetCode').fill('000000');
  await page.locator('#newPassword').fill(newPassword);
  await page.locator('#confirmPassword').fill(newPassword);
  await page.getByRole('button', { name: 'Passwort speichern' }).click();
  await expect(
    page.getByText(/Passwort konnte nicht zurückgesetzt werden|ungültig/i)
  ).toBeVisible();

  const resetCode = await getVerificationCodeForEmail(uniqueEmail);
  await page.locator('#resetCode').fill(resetCode);
  await page.getByRole('button', { name: 'Passwort speichern' }).click();
  await page.waitForURL('**/browse-events');
  await expect(page.getByTestId('header-user-menu')).toBeVisible();
});

test('forgot-password validates new password rules and confirmation on frontend', async ({
  page,
}, testInfo) => {
  const uniqueEmail = `e2e-reset-validate-${testInfo.project.name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}@bazarpro.de`;
  const initialPassword = 'Testpassword1!';

  await page.goto('/register');
  await page.getByTestId('register-emailfield').fill(uniqueEmail);
  await page.getByTestId('register-password').fill(initialPassword);
  await page.getByTestId('register-password-confirm').fill(initialPassword);
  await page.getByTestId('register-terms-checkbox').click();
  await page.getByTestId('register-button-submit').click();
  await expect(page.getByTestId('form-email-verification')).toBeVisible();

  confirmEmailForE2E(uniqueEmail);

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.waitForURL('**/login');
  await page.getByRole('button', { name: 'Passwort vergessen?' }).click();
  await page.locator('#resetEmail').fill(uniqueEmail);
  await page.getByRole('button', { name: 'Code anfordern' }).click();
  await expect(page.getByRole('heading', { name: 'Passwort neu setzen' })).toBeVisible();

  const resetCode = await getVerificationCodeForEmail(uniqueEmail);
  await page.locator('#resetCode').fill(resetCode);

  await page.locator('#newPassword').fill('Kurz1!');
  await page.locator('#confirmPassword').fill('Kurz1!');
  await expect(page.getByRole('button', { name: 'Passwort speichern' })).toBeDisabled();
  await expect(page.getByText('10+ Zeichen')).toBeVisible();

  await page.locator('#newPassword').fill('StarkesPasswort1!');
  await page.locator('#confirmPassword').fill('AnderesPasswort1!');
  await expect(page.getByRole('button', { name: 'Passwort speichern' })).toBeDisabled();
  await expect(page.getByText('Passwörter stimmen nicht überein')).toBeVisible();
});

async function getVerificationCodeForEmail(email: string) {
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const output = runConvexCommandWithOutput(
        'run users:getE2eVerificationCode',
        `"{ \\"email\\": \\"${email}\\" }"`
      );
      const token = output.replace(/^"|"$/g, '').trim();
      if (token) {
        return token;
      }
    } catch {
      // Wait for async persistence.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Konnte keinen E2E-Verifizierungscode für ${email} abrufen.`);
}

function confirmEmailForE2E(email: string) {
  runConvexCommand('run users:confirmEmailForE2E', `"{ \\"email\\": \\"${email}\\" }"`);
}
