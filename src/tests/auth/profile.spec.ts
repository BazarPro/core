import { test, expect, type Page } from '@playwright/test';

test.describe('profile page', () => {
  test('updates profile and validates invalid inputs', async ({ page }, testInfo) => {
    const uniqueTag = testInfo.project.name.replace(/\s+/g, '-');
    const firstName = `E2E-${uniqueTag}`;
    const lastName = 'Profile';

    await login(page, 'user1@bazarpro.de', '123456');
    await page.goto('/account');
    await expect(page.getByRole('heading', { name: 'Kontoverwaltung' })).toBeVisible();

    await page.locator('#phone').fill('abc');
    await page.locator('#zipCode').fill('123');
    await expect(page.getByRole('button', { name: 'Profil aktualisieren' })).toBeVisible();
    await page.getByRole('button', { name: 'Profil aktualisieren' }).click();

    await expect(page.getByText('Ungültiges Telefonnummer-Format')).toBeVisible();
    await expect(page.getByText('Ungültige Postleitzahl (5 Ziffern erforderlich)')).toBeVisible();

    await page.locator('#firstName').fill(firstName);
    await page.locator('#lastName').fill(lastName);
    await page.locator('#phone').fill('+49 123 456789');
    await page.locator('#street').fill('Musterstraße 1');
    await page.locator('#zipCode').fill('89073');
    await page.locator('#city').fill('Ulm');
    await page.locator('#country').fill('Deutschland');
    await page.getByRole('button', { name: 'Profil aktualisieren' }).click();

    await expect(page.getByText('Profil erfolgreich aktualisiert!')).toBeVisible();

    await page.reload();
    await expect(page.locator('#firstName')).toHaveValue(firstName);
    await expect(page.locator('#lastName')).toHaveValue(lastName);
    await expect(page.locator('#zipCode')).toHaveValue('89073');
  });

  test('shows digital id and allows data export', async ({ page }) => {
    await login(page, 'user2@bazarpro.de', '123456');
    await page.goto('/account');
    await expect(page.getByRole('heading', { name: 'Kontoverwaltung' })).toBeVisible();

    await page.getByRole('button', { name: 'Ausweis anzeigen' }).click();
    await expect(page.getByText(/Gültig für \d+s/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Jetzt aktualisieren' })).toBeVisible();
    const qrCode = page.locator('svg[width="180"][height="180"]');
    await expect(qrCode).toBeVisible();
    const pathCount = await qrCode.locator('path').count();
    expect(pathCount).toBeGreaterThan(0);

    const qrMarkupBefore = await qrCode.innerHTML();
    await page.getByRole('button', { name: 'Jetzt aktualisieren' }).click();
    await expect
      .poll(async () => await qrCode.innerHTML(), {
        message: 'QR-Code sollte sich nach manueller Aktualisierung ändern',
      })
      .not.toBe(qrMarkupBefore);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Daten extrahieren (JSON)' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^bazarpro-data-export-\d{4}-\d{2}-\d{2}\.json$/);
  });

  test('shows inline error for wrong old password', async ({ page }) => {
    await login(page, 'user3@bazarpro.de', '123456');
    await page.goto('/account');
    await expect(page.getByRole('heading', { name: 'Kontoverwaltung' })).toBeVisible();

    await page.locator('#oldPassword').fill('falsch123');
    await page.locator('#newPassword').fill('SicheresPasswort1!');
    await page.locator('#confirmPassword').fill('SicheresPasswort1!');
    await expect(page.getByRole('button', { name: 'Passwort aktualisieren' })).toBeVisible();
    await page.getByRole('button', { name: 'Passwort aktualisieren' }).click();

    await expect(
      page.getByText('Das aktuelle Passwort stimmt nicht. Bitte überprüfe deine Eingabe.')
    ).toBeVisible();
  });

  test('shows validation errors for password form', async ({ page }) => {
    await login(page, 'user3@bazarpro.de', '123456');
    await page.goto('/account');
    await expect(page.getByRole('heading', { name: 'Kontoverwaltung' })).toBeVisible();

    await page.locator('#oldPassword').fill('123456');
    await page.locator('#newPassword').fill('Kurz1!');
    await page.locator('#confirmPassword').fill('Anderes1!');
    await page.getByRole('button', { name: 'Passwort aktualisieren' }).click();
    await expect(
      page.locator('p.text-xs').filter({ hasText: 'Mindestens 10 Zeichen' }).first()
    ).toBeVisible();
    await expect(page.getByText('Die Passwörter stimmen nicht überein')).toBeVisible();

    await page.locator('#oldPassword').fill('');
    await page.locator('#newPassword').fill('SicheresPasswort1!');
    await page.locator('#confirmPassword').fill('SicheresPasswort1!');
    await page.getByRole('button', { name: 'Passwort aktualisieren' }).click();
    await expect(page.getByText('Altes Passwort ist erforderlich')).toBeVisible();
  });

  test('changes password successfully', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name.includes('firefox'),
      'Destruktiver Password-Change wird nur einmal in Chromium getestet.'
    );

    await login(page, 'user5@bazarpro.de', '123456');
    await page.goto('/account');

    await page.getByLabel('Aktuelles Passwort').fill('123456');
    await page.getByLabel('Neues Passwort setzen').fill('NeuesSicheresPasswort1!');
    await page.getByLabel('Passwort bestätigen').fill('NeuesSicheresPasswort1!');
    await page.getByRole('button', { name: 'Passwort aktualisieren' }).click();

    await expect(page.getByText('Passwort erfolgreich geändert!')).toBeVisible({ timeout: 10000 });
  });

  test.describe('Account Deletion', () => {
    test.describe.configure({ mode: 'serial' });

    // eslint-disable-next-line no-empty-pattern
    test.beforeEach(async ({}, testInfo) => {
      test.skip(
        testInfo.project.name !== 'auth chromium',
        'Destruktiver Account-Delete wird nur einmal in Chromium getestet.'
      );
    });

    test('account deletion does not work when being organizer of event', async ({ page }) => {
      await login(page, 'user4@bazarpro.de', '123456');
      await createDefaultEvent(page);
      await page.goto('/account');
      await page.getByRole('button', { name: 'Konto löschen' }).click();
      await page.getByRole('button', { name: 'Ja, Konto löschen' }).click();
      await expect(
        page.getByText(
          'Account kann nicht gelöscht werden, da du Organisator einer Veranstaltung bist.'
        )
      ).toBeVisible({ timeout: 10000 });

      await page.goto('/my-events');

      await page.getByRole('button', { name: 'Zur Veranstaltung' }).click();
      await page.waitForURL('**/events/view/*', { timeout: 10000 });
      // Navigate to Settings - currently we go directly or via card.
      // Based on App.tsx, the path is /events/view/:eventId/settings
      await page.goto(page.url() + '/settings');
      await expect(page.getByRole('heading', { name: 'Event-Einstellungen' })).toBeVisible();

      await page.getByRole('button', { name: 'Event löschen' }).click();
      await page.getByRole('button', { name: 'Löschen' }).click();
      await expect(
        page.getByRole('heading', { name: 'Keine Veranstaltungen gefunden' })
      ).toBeVisible({ timeout: 10000 });
    });

    test('deletes account and cannot login afterwards', async ({ page }) => {
      await login(page, 'user4@bazarpro.de', '123456');
      await page.goto('/account');
      await page.getByRole('button', { name: 'Konto löschen' }).click();
      await page.getByRole('button', { name: 'Ja, Konto löschen' }).click();
      await expect(page.getByText('Konto erfolgreich gelöscht.')).toBeVisible();

      await page.goto('/login');
      await page.getByRole('textbox', { name: 'E-Mail-Adresse' }).fill('user4@bazarpro.de');
      await page.getByRole('textbox', { name: 'Passwort' }).fill('123456');
      await page.getByTestId('button-login-submit').click();
      await expect(page.getByRole('alert')).toContainText(
        'Dein Account wurde gelöscht. Du kannst deinen Account durch den Button unten reaktivieren. Nach Reaktivierung musst du deine Email-Adresse erneut verifizieren.'
      );
      await expect(page.getByTestId('button-login-submit')).toContainText('Account reaktivieren');
      await page.getByTestId('button-login-submit').click();
      await expect(page.getByRole('listitem')).toContainText(
        'Account erfolgreich reaktiviert. Du kannst dich jetzt anmelden.'
      );
      await page.getByTestId('button-login-submit').click();
      await expect(page.getByRole('heading', { name: 'Prüfe dein Postfach' })).toBeVisible({
        timeout: 10000,
      });
    });
  });
});

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'E-Mail-Adresse' }).fill(email);
  await page.getByRole('textbox', { name: 'Passwort' }).fill(password);
  await page.getByTestId('button-login-submit').click();

  // Handle potential states: Success, Reactivation required, or Error
  const reactivationButton = page.getByRole('button', { name: 'Account reaktivieren' });
  const errorAlert = page.getByTestId('alert-wrong-login');

  try {
    await Promise.race([
      page.waitForURL('**/browse-events', { timeout: 15000 }),
      reactivationButton.waitFor({ state: 'visible', timeout: 15000 }),
      errorAlert.waitFor({ state: 'visible', timeout: 15000 }),
    ]);
  } catch {}

  if (await errorAlert.isVisible()) {
    const errorText = await errorAlert.textContent();
    throw new Error(`Login failed for ${email}: ${errorText}`);
  }

  if (await reactivationButton.isVisible()) {
    await reactivationButton.click();
    await expect(
      page.getByText('Account erfolgreich reaktiviert. Du kannst dich jetzt anmelden.')
    ).toBeVisible({ timeout: 10000 });
    await page.getByTestId('button-login-submit').click();
  }

  await page.waitForURL('**/browse-events', { timeout: 20000 });
}

async function createDefaultEvent(page: Page) {
  await page.goto('/events/new');
  await page.getByRole('textbox', { name: 'Titel der Veranstaltung *' }).fill('Test Veranstaltung');
  await page
    .getByRole('textbox', { name: 'Beschreibung *' })
    .fill('Das ist eine Default Test Veranstaltung');
  await page.getByRole('textbox', { name: 'Ort *' }).fill('Ulm');
  await page.getByRole('textbox', { name: 'Startdatum *' }).fill('2099-01-01T22:10');
  await page.getByRole('textbox', { name: 'Enddatum *' }).fill('2100-01-01T22:10');
  await page.getByText('Kleidung').click();
  await page
    .getByRole('textbox', { name: 'Kontaktdaten / Veranstalter-' })
    .fill('Kontaktdaten Veranstalter 1');
  await page.getByRole('button', { name: 'Veranstaltung erstellen' }).click();

  // Wait for redirect to my-events or the event dashboard to ensure creation is finished
  await page.waitForURL('**/my-events', { timeout: 15000 });
}
