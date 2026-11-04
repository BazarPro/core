import { expect, type Page } from '@playwright/test';

export interface EventFormInput {
  title: string;
  description: string;
  location: string;
  /** Values for the datetime-local inputs, e.g. 2099-01-01T10:00 */
  start: string;
  end: string;
  category: string;
  contact: string;
}

/**
 * Goes through the creation wizard on /events/new without an event type and creates
 * the event: the settings first, the details at the end. Steps without required fields
 * are skipped with "Weiter".
 */
export async function fillEventWizard(page: Page, input: EventFormInput) {
  const next = () => page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Neue Veranstaltung erstellen' })).toBeVisible();
  await page.getByRole('button', { name: 'Ohne Vorlage weiter' }).click();

  // Sale
  await expect(page.getByRole('heading', { name: 'Wie wird verkauft?' })).toBeVisible();
  await next();

  // Items
  const categorySection = page
    .getByRole('heading', { name: 'Kategorien & Services' })
    .locator('..');
  await categorySection.getByText(input.category, { exact: true }).click();
  await next();

  // Fees, then registration
  await expect(page.getByRole('heading', { name: 'Was kostet es die Verkäufer?' })).toBeVisible();
  await next();
  await expect(page.getByRole('heading', { name: 'Wer darf mitmachen?' })).toBeVisible();
  await next();

  // Details at the end: date, place and contact
  await page.getByLabel('Titel der Veranstaltung *').fill(input.title);
  await page.locator('#description').fill(input.description);
  await page.getByLabel('Veranstaltungsort *').fill(input.location);
  await page.locator('#startDate').fill(input.start);
  await page.locator('#endDate').fill(input.end);
  await page.getByLabel('Kontaktdaten / Veranstalter-Info *').fill(input.contact);
  await next();

  await expect(page.getByRole('heading', { name: 'Abgabe und Abholung' })).toBeVisible();
  await next();

  await expect(page.getByRole('heading', { name: 'So sieht dein Basar aus' })).toBeVisible();
  await page.getByRole('button', { name: 'Veranstaltung erstellen' }).click();
}
