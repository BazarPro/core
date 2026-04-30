import { test, expect, type Page } from '@playwright/test';
import { approveEventByTitle } from '../helpers/eventApproval';

test.describe('event approval flow', () => {
  test('public event is hidden until approved by admin', async ({ page, browser }, testInfo) => {
    const uniqueTag = testInfo.project.name.replace(/\s+/g, '-').toLowerCase();
    const eventTitle = `E2E Event Approval ${uniqueTag} ${Date.now()}`;
    const startDate = buildDateOffset(1, 10, 0);
    const endDate = buildDateOffset(2, 18, 0);

    await login(page, 'admin@bazarpro.de', '123456');
    const eventId = await createEvent(page, eventTitle, startDate, endDate);

    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    await anonPage.goto(`/public-events/${eventId}`);
    await expect(anonPage.getByText('Veranstaltung nicht gefunden.')).toBeVisible();

    await approveEventByTitle(page, eventTitle);

    await anonPage.reload();
    await expect(anonPage.getByRole('heading', { name: eventTitle })).toBeVisible();
    await anonContext.close();
  });
});

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'E-Mail-Adresse' }).fill(email);
  await page.getByRole('textbox', { name: 'Passwort' }).fill(password);
  await page.getByTestId('button-login-submit').click();
  await page.waitForURL('**/browse-events');
}

async function createEvent(page: Page, eventTitle: string, startDate: Date, endDate: Date) {
  await page.goto('/my-events');
  await page.getByRole('button', { name: 'Neue Veranstaltung' }).click();
  await expect(page.getByRole('heading', { name: 'Neue Veranstaltung erstellen' })).toBeVisible();

  await page.getByLabel('Titel der Veranstaltung *').fill(eventTitle);
  await page.locator('#description').fill('E2E Freigabe-Test');
  await page.getByLabel('Ort *').fill('Leipzig');
  await page.locator('#startDate').fill(formatDateTimeLocal(startDate));
  await page.locator('#endDate').fill(formatDateTimeLocal(endDate));

  const categorySection = page
    .getByRole('heading', { name: 'Kategorien & Services' })
    .locator('..');
  await categorySection.getByText('Sport', { exact: true }).click();

  await page
    .getByLabel('Kontaktdaten / Veranstalter-Info *')
    .fill('Demo Veranstalter\ninfo@bazarpro.de');

  await page.getByRole('button', { name: 'Veranstaltung erstellen' }).click();
  await expect(page.getByText('Veranstaltung erfolgreich erstellt')).toBeVisible();
  await page.waitForURL('**/my-events');

  const eventCardHeading = page.getByRole('heading', { name: eventTitle });
  await expect(eventCardHeading).toBeVisible();
  const eventCard = page.locator('div.bg-card', { has: eventCardHeading }).first();
  await eventCard.getByRole('button', { name: 'Zur Veranstaltung' }).click();
  await page.waitForURL(/\/events\/view\/[^/]+/);
  return extractEventId(page.url());
}

function buildDateOffset(days: number, hour: number, minute: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function formatDateTimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function extractEventId(url: string) {
  const match = url.match(/\/events\/view\/([^/?#]+)/);
  if (!match) {
    throw new Error(`Konnte eventId nicht aus URL lesen: ${url}`);
  }
  return match[1];
}
