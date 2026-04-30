import { test, expect, type Page } from '@playwright/test';
import { approveEventByTitle } from '../helpers/eventApproval';

test.describe('role permissions', () => {
  test('helper cannot manage helpers, organizer has settings access', async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(60000);

    const uniqueTag = testInfo.project.name.replace(/\s+/g, '-').toLowerCase();
    const eventTitle = `E2E Event Roles ${uniqueTag} ${Date.now()}`;
    const startDate = buildDateOffset(1, 10, 0);
    const endDate = buildDateOffset(2, 18, 0);

    await login(page, 'admin@bazarpro.de', '123456');
    const eventId = await createEvent(page, eventTitle, startDate, endDate);
    await approveEventByTitle(page, eventTitle);

    const sellerContext = await browser.newContext();
    const sellerPage = await sellerContext.newPage();
    await login(sellerPage, 'seller@bazarpro.de', '123456');
    await joinEventAsSeller(sellerPage, eventId);

    await assignCoOrganizer(page, eventId);

    // Navigate through dashboard to Sellers
    await sellerPage.goto(`/events/view/${eventId}`);
    const sellerParticipantsButton = sellerPage
      .getByRole('navigation')
      .getByRole('button', { name: 'Teilnehmer' });
    await expect(sellerParticipantsButton).toBeVisible();
    await sellerParticipantsButton.click();

    await sellerPage.waitForURL('**/sellers');
    await expect(sellerPage.getByRole('heading', { name: 'Teilnehmer & Helfer' })).toBeVisible();
    await expect(sellerPage.getByRole('button', { name: 'Zum Helfer ernennen' })).toHaveCount(0);
    await expect(sellerPage.getByRole('button', { name: 'Helfer-Rechte entziehen' })).toHaveCount(
      0
    );

    // Navigate to Cash page
    await sellerPage.goto(`/events/view/${eventId}`);
    await expect(sellerPage.getByText('Umsatz', { exact: true })).toBeVisible();
    // Revenue card might lead to products?tab=sold, but there's no direct cash link in cards yet?
    // Wait, let's check the cards in EventManagementDashboard.tsx
    // Card 1: products, Card 2: sellers, Card 3: products?tab=sold
    // It seems there is no card for "Cash Reconciliation" yet on the main dashboard?
    // Let me check App.tsx again.
    // <Route path="/events/view/:eventId/cash" element={<CashReconciliationPage />} />
    // If there's no card, I'll use the direct URL for now, but the user said "so dass mein neues Event Management Dashboard damit funktioniert".
    // Maybe I should add a card for Cash Reconciliation to the dashboard if it's missing?
    // No, I should stick to adapting the tests.

    await sellerPage.goto(`/events/view/${eventId}/cash`);
    await expect(sellerPage.getByRole('heading', { name: 'Kassensturz' })).toBeVisible();

    await sellerPage.goto(`/events/view/${eventId}/settings`);
    await expect(sellerPage.getByRole('heading', { name: 'Event-Einstellungen' })).toBeVisible();
    await expect(
      sellerPage.getByRole('button', { name: 'Einstellungen bearbeiten' })
    ).toBeDisabled();
    await expect(sellerPage.getByRole('button', { name: 'Event löschen' })).toBeDisabled();

    await page.goto(`/events/view/${eventId}/settings`);
    await expect(page.getByRole('heading', { name: 'Event-Einstellungen' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Einstellungen bearbeiten' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Event löschen' })).toBeEnabled();

    await sellerContext.close();
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
  await page.locator('#description').fill('E2E Rollen-Test');
  await page.getByLabel('Ort *').fill('Köln');
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

async function joinEventAsSeller(page: Page, eventId: string) {
  await page.goto(`/public-events/${eventId}`);

  await expect(page.getByRole('button', { name: 'Als Verkäufer beitreten' })).toBeVisible();

  await page.getByRole('button', { name: 'Als Verkäufer beitreten' }).click();
  const firstNameField = page.getByRole('textbox', { name: 'Vorname' });
  if (await firstNameField.isVisible({ timeout: 5000 }).catch(() => false)) {
    await fillProfileForm(page);
  }

  await page.getByRole('button', { name: 'Anmelden bestätigen' }).click();
  await expect(page.getByText(/^Anmeldung erfolgreich!/)).toBeVisible();
}

async function fillProfileForm(page: Page) {
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
async function assignCoOrganizer(page: Page, eventId: string) {
  await page.goto(`/events/view/${eventId}`);
  const participantsButton = page
    .getByRole('navigation')
    .getByRole('button', { name: 'Teilnehmer' });
  await expect(participantsButton).toBeVisible();
  await participantsButton.click();

  await page.waitForURL('**/sellers');
  await expect(page.getByRole('heading', { name: 'Teilnehmer & Helfer' })).toBeVisible();
  const sellerRow = page.getByRole('row', { name: /Demo Seller/i });
  await sellerRow.getByRole('button', { name: 'Zum Helfer ernennen' }).click();
  await page.getByRole('button', { name: 'Als Helfer ernennen' }).click();
  await expect(page.getByText('wurde als Helfer hinzugefügt')).toBeVisible();
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
