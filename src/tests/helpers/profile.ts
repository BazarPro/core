import { type Page } from '@playwright/test';

/**
 * Completes the contact steps of the event registration dialog (name and phone, then
 * address) until the dialog offers "Anmelden bestätigen". Seed users have no phone
 * number, and several tests register the same seed sellers in parallel: whichever
 * completes the profile first makes the steps vanish for the others, so every step is
 * optional and looked for again.
 */
export async function fillProfileForm(page: Page) {
  const confirm = page.getByRole('button', { name: 'Anmelden bestätigen' });
  for (let round = 0; round < 8; round += 1) {
    if (await confirm.isVisible()) return;
    try {
      const firstName = page.getByRole('textbox', { name: 'Vorname' });
      const street = page.getByRole('textbox', { name: 'Straße und Hausnummer' });
      if (await firstName.isVisible()) {
        if ((await firstName.inputValue()) === '') await firstName.fill('Vorname');
        const lastName = page.getByRole('textbox', { name: 'Nachname' });
        if ((await lastName.inputValue()) === '') await lastName.fill('Nachname');
        await page.getByRole('textbox', { name: 'Telefonnummer' }).fill('0123456789');
        await page.getByRole('button', { name: /weiter/i }).click({ timeout: 2000 });
      } else if (await street.isVisible()) {
        await street.fill('Musterstrasse 1', { timeout: 2000 });
        await page.getByRole('textbox', { name: 'Postleitzahl' }).fill('12345', { timeout: 2000 });
        await page.getByRole('textbox', { name: 'Ort' }).fill('de', { timeout: 2000 });
        await page.getByRole('textbox', { name: 'Land' }).fill('de', { timeout: 2000 });
        await page.getByRole('button', { name: /speichern/i }).click({ timeout: 2000 });
      }
    } catch {
      // The step vanished while filling it in; look again
    }
    await page.waitForTimeout(300);
  }
}
