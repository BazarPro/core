import { test, expect, type Page } from '@playwright/test';
import { runConvexCommand, runConvexCommandWithOutput } from '../utils';

test.describe.configure({ mode: 'serial' });

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

test('1) Registrierung ohne EventID -> Onboarding-Auswahl kommt sofort', async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  const uniqueEmail = makeUniqueEmail('direct-register', testInfo.project.name);

  await registerAndVerify(page, uniqueEmail, '/register');
  await page.waitForURL('**/browse-events', { timeout: 30000 });

  await expect(page.getByRole('heading', { name: 'Willkommen bei BazarPro' })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByRole('button', { name: 'Als Verkäufer teilnehmen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Veranstaltung erstellen' })).toBeVisible();
});

test('2) Registrierung mit EventID + Neues Produkt -> Onboarding nach Produkt hinzufügen', async ({
  page,
}, testInfo) => {
  test.setTimeout(240000);
  const uniqueEmail = makeUniqueEmail('join-create-product', testInfo.project.name);

  const eventTitle = await openFirstPublicEvent(page);
  await page.getByRole('button', { name: 'Als Verkäufer beitreten' }).click();
  await expect(page).toHaveURL(/\/register\?joinEventId=/);

  await registerAndVerify(page, uniqueEmail);

  await page.waitForURL(/\/public-events\/.+/, { timeout: 30000 });
  setProfileForE2E(uniqueEmail);
  await page.reload();
  await page.getByRole('button', { name: 'Als Verkäufer beitreten' }).click();
  await expect(page.getByRole('heading', { name: /^Anmeldung für / })).toBeVisible({
    timeout: 20000,
  });
  await page.getByRole('button', { name: 'Anmelden bestätigen' }).click();

  await expect(page.getByRole('heading', { name: 'Anmeldung erfolgreich!' })).toBeVisible({
    timeout: 20000,
  });
  await page.getByRole('button', { name: 'Neues Produkt erstellen' }).click();
  await page.waitForURL('**/products/new', { timeout: 30000 });

  await expect(page.getByRole('heading', { name: 'Willkommen bei BazarPro' })).not.toBeVisible();

  await fillAndCreateProduct(page, eventTitle, 'Produkt aus Event-Join Flow');
  await page.waitForURL('**/my-products', { timeout: 60000 });

  await expect(page.getByText(/^Schritt 1 von/)).toBeVisible({ timeout: 15000 });
});

test('3) Registrierung mit EventID + Event-Wizard schließen -> Onboarding sofort', async ({
  page,
}, testInfo) => {
  test.setTimeout(180000);
  const uniqueEmail = makeUniqueEmail('join-close-wizard', testInfo.project.name);

  await openFirstPublicEvent(page);
  await page.getByRole('button', { name: 'Als Verkäufer beitreten' }).click();
  await expect(page).toHaveURL(/\/register\?joinEventId=/);

  await registerAndVerify(page, uniqueEmail);

  await page.waitForURL(/\/public-events\/.+/, { timeout: 30000 });
  setProfileForE2E(uniqueEmail);
  await page.reload();
  await page.getByRole('button', { name: 'Als Verkäufer beitreten' }).click();
  await expect(page.getByRole('heading', { name: /^Anmeldung für / })).toBeVisible({
    timeout: 20000,
  });
  await page.getByRole('button', { name: 'Anmelden bestätigen' }).click();

  await expect(page.getByRole('heading', { name: 'Anmeldung erfolgreich!' })).toBeVisible({
    timeout: 20000,
  });
  await page.getByRole('button', { name: 'Vorerst nicht, danke' }).click();

  await page.waitForURL('**/my-products', { timeout: 30000 });
  await expect(page.getByText(/^Schritt 1 von/)).toBeVisible({ timeout: 15000 });
});

function makeUniqueEmail(prefix: string, projectName: string): string {
  return `e2e-onboarding-${prefix}-${projectName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}@bazarpro.de`;
}

async function registerAndVerify(page: Page, email: string, registerPath?: string) {
  if (registerPath) {
    await page.goto(registerPath);
  }

  await page.getByTestId('register-emailfield').fill(email);
  await page.getByTestId('register-password').fill('Testpassword1!');
  await page.getByTestId('register-password-confirm').fill('Testpassword1!');
  await page.getByTestId('register-terms-checkbox').click();
  await page.getByTestId('register-button-submit').click();

  await expect(page.getByTestId('form-email-verification')).toBeVisible();

  const verificationCode = await getVerificationCodeForEmail(email);
  await page.getByLabel('Verifizierungscode').fill(verificationCode);
  await page.getByRole('button', { name: 'E-Mail bestätigen' }).click();
}

async function openFirstPublicEvent(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Details ansehen' }).first().click();
  await page.waitForURL(/\/public-events\/.+/, { timeout: 30000 });
  return (await page.getByRole('heading', { level: 1 }).first().innerText()).trim();
}

async function fillAndCreateProduct(page: Page, eventTitle: string, productTitle: string) {
  await page.getByLabel('Produktname *').fill(productTitle);
  await page.getByLabel('Beschreibung').fill('E2E Testprodukt für Onboarding-Trigger');

  await page.getByLabel('Zustand *').click();
  await page.getByRole('option', { name: 'Gebraucht, wie neu' }).click();

  await page.getByLabel('Kategorie *').click();
  await page.getByRole('option', { name: 'Sport' }).click();

  await page.getByLabel('Preis (€) *').fill('25');

  const fileInputs = page.locator('input[type="file"]');
  const fileInputCount = await fileInputs.count();
  await fileInputs
    .nth(fileInputCount - 1)
    .setInputFiles('public/images/onboarding/dummyproduct-image.png');
  await expect(page.locator('img[alt^="Preview "]').first()).toBeVisible({ timeout: 15000 });

  const eventLabel = page.locator('label', { hasText: eventTitle }).first();
  if (await eventLabel.isVisible()) {
    await eventLabel.click();
  }

  await page.getByRole('button', { name: 'Produkt erstellen' }).click();
}

function setProfileForE2E(email: string) {
  runConvexCommand('run users:setProfileForE2E', `"{ \\"email\\": \\"${email}\\" }"`);
}

async function getVerificationCodeForEmail(email: string) {
  for (let attempt = 1; attempt <= 12; attempt++) {
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
      // Wait for async token persistence.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Konnte keinen E2E-Verifizierungscode für ${email} abrufen.`);
}
