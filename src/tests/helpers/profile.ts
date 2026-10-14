import { expect, type Page } from '@playwright/test';

/**
 * Completes the contact steps of the event registration dialog (name and phone, then
 * address). Seed users have no phone number, so whichever test registers a seller
 * first sees these steps.
 */
export async function fillProfileForm(page: Page) {
  const firstNameField = page.getByRole('textbox', { name: 'Vorname' });
  await expect(firstNameField).toBeVisible();
  if ((await firstNameField.inputValue()) === '') {
    await firstNameField.fill('Vorname');
  }

  const lastNameField = page.getByRole('textbox', { name: 'Nachname' });
  if ((await lastNameField.inputValue()) === '') {
    await lastNameField.fill('Nachname');
  }
  await page.getByRole('textbox', { name: 'Telefonnummer' }).fill('0123456789');
  await page.getByRole('button', { name: /weiter/i }).click();
  await page.getByRole('textbox', { name: 'Straße und Hausnummer' }).fill('Musterstrasse 1');
  await page.getByRole('textbox', { name: 'Postleitzahl' }).fill('12345');
  await page.getByRole('textbox', { name: 'Ort' }).fill('de');
  await page.getByRole('textbox', { name: 'Land' }).fill('de');
  await page.getByRole('button', { name: /speichern/i }).click();
}
