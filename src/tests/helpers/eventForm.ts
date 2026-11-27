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
 * the event: date and place first, then the settings, the description at the end. Steps
 * without required fields are skipped with "Weiter".
 */
export async function fillEventWizard(page: Page, input: EventFormInput) {
  const next = () => page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Neuen Basar anlegen' })).toBeVisible();
  await page.getByRole('button', { name: 'Ohne Vorlage weiter' }).click();

  // When and where: one day, start and end time (several days only when they differ)
  await expect(page.getByRole('heading', { name: 'Wann und wo?' })).toBeVisible();
  await page.getByLabel('Titel des Basars *').fill(input.title);
  const [startDay, startTime] = input.start.split('T');
  const [endDay, endTime] = input.end.split('T');
  await page.locator('#startDay').fill(startDay);
  await page.locator('#startTime').fill(startTime);
  if (endDay !== startDay) {
    await page.getByLabel('Geht über mehrere Tage').check();
    await page.locator('#endDay').fill(endDay);
  }
  await page.locator('#endTime').fill(endTime);
  await page.getByLabel('Veranstaltungsort *').fill(input.location);
  await next();

  // Items and sale on one step
  await expect(page.getByRole('heading', { name: 'Artikel und Verkauf' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Wie wird verkauft?' })).toBeVisible();
  // Without a template every category is allowed: keep only the one asked for
  const categorySection = page.locator('section').filter({ hasText: 'Erlaubte Artikelkategorien' });
  await categorySection.getByRole('button', { name: 'Keine', exact: true }).click();
  await categorySection.getByText(input.category, { exact: true }).click();
  await next();

  // Fees and registration on one step; drop-off was folded under "when and where"
  await expect(page.getByRole('heading', { name: 'Gebühren und Anmeldung' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Wer darf mitmachen?' })).toBeVisible();
  await next();

  // Description and contact
  await expect(page.getByRole('heading', { name: 'Beschreibung und Kontakt' })).toBeVisible();
  await page.locator('#description').fill(input.description);
  await page.getByLabel('Kontaktdaten / Veranstalter-Info *').fill(input.contact);
  await next();

  await expect(page.getByRole('heading', { name: 'So sieht dein Basar aus' })).toBeVisible();
  await page.getByRole('button', { name: 'Basar anlegen' }).click();
}
