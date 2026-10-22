import { test, expect, type Page } from '@playwright/test';
import { approveEventByTitle } from '../helpers/eventApproval';
import { fillProfileForm } from '../helpers/profile';
import { fillEventWizard } from '../helpers/eventForm';
import { isOverview } from '../utils';

test.describe('co-organizer permissions', () => {
  test('helper can view participants but cannot grant helper roles', async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(60000);
    test.skip(testInfo.project.name != 'auth chromium'); // Otherwise Tests cancel each other out
    const uniqueTag = testInfo.project.name.replace(/\s+/g, '-').toLowerCase();
    const eventTitle = `E2E Event Helper ${uniqueTag} ${Date.now()}`;
    const startDate = buildDateOffset(1, 9, 0);
    const endDate = buildDateOffset(2, 18, 0);

    await login(page, 'admin@bazarpro.de', '123456');
    await page.goto('/my-events');
    const newEventButton = page.getByRole('button', { name: 'Neue Veranstaltung' });
    await expect(newEventButton).toBeVisible();
    await newEventButton.click();
    await page.waitForURL('**/events/new');
    await fillEventWizard(page, {
      title: eventTitle,
      description: 'E2E Helfer-Berechtigungen',
      location: 'Hamburg',
      start: formatDateTimeLocal(startDate),
      end: formatDateTimeLocal(endDate),
      category: 'Sport',
      contact: 'Demo Veranstalter\ninfo@bazarpro.de',
    });
    await expect(page.getByText('Veranstaltung erfolgreich erstellt')).toBeVisible();
    // A new event opens right away
    await page.waitForURL(/\/events\/view\/[^/]+/);
    const eventId = extractEventId(page.url());
    await approveEventByTitle(page, eventTitle);

    const sellerContext = await browser.newContext();
    const sellerPage = await sellerContext.newPage();
    await login(sellerPage, 'seller@bazarpro.de', '123456');
    await joinEventAsSeller(sellerPage, eventId);

    // Navigate to Dashboard and then to Sellers
    await page.goto(`/events/view/${eventId}`);
    const participantsButton = page
      .getByRole('navigation')
      .getByRole('button', { name: 'Teilnehmer' });
    await expect(participantsButton).toBeVisible();
    await participantsButton.click();

    await page.waitForURL('**/sellers');
    await expect(page.getByRole('heading', { name: 'Teilnehmer & Helfer' })).toBeVisible();

    // The list might take a moment to sync from the background join action
    const sellerRow = page.getByRole('row', { name: /Demo Seller/i });
    await expect(sellerRow).toBeVisible({ timeout: 15000 });

    await sellerRow.getByRole('button', { name: 'Zum Helfer ernennen' }).click();
    await page.getByRole('button', { name: 'Als Helfer ernennen' }).click();
    await expect(page.getByText('wurde als Helfer hinzugefügt')).toBeVisible();

    // The organizer overview (the old /my-events) marks events where one only helps
    await sellerPage.goto('/my-events');
    const sellerEventCard = sellerPage
      .getByTestId('current-event')
      .or(sellerPage.getByRole('listitem'))
      .filter({ hasText: eventTitle })
      .first();
    await expect(sellerEventCard.getByText('Helfer', { exact: true })).toBeVisible();

    // Co-organizer views participants (sellers)
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

    await sellerContext.close();
  });
});

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'E-Mail-Adresse' }).fill(email);
  await page.getByRole('textbox', { name: 'Passwort' }).fill(password);
  await page.getByTestId('button-login-submit').click();
  await page.waitForURL(isOverview);
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

async function joinEventAsSeller(page: Page, eventId: string) {
  await page.goto(`/public-events/${eventId}`);

  await expect(page.getByRole('button', { name: 'Als Verkäufer beitreten' })).toBeVisible();

  await page.getByRole('button', { name: 'Als Verkäufer beitreten' }).click();
  const profileForm = page.getByTestId('join-event-form');
  if (await profileForm.isVisible({ timeout: 5000 }).catch(() => false)) {
    await fillProfileForm(page);
  }

  const confirmJoinButton = page.getByRole('button', { name: 'Anmelden bestätigen' });
  await expect(confirmJoinButton).toBeVisible({ timeout: 10000 });
  await confirmJoinButton.click();
  await expect(page.getByText(/^Anmeldung erfolgreich!/)).toBeVisible();
}
