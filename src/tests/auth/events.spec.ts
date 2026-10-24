import { test, expect, type Page } from '@playwright/test';
import { approveEventByTitle } from '../helpers/eventApproval';
import { fillProfileForm } from '../helpers/profile';
import { fillEventWizard } from '../helpers/eventForm';
import { isOverview } from '../utils';

test.describe('event creation and co-organizer flow', () => {
  test('organizer creates event, seller registers, helper role is assigned', async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(60000);
    const uniqueTag = testInfo.project.name.replace(/\s+/g, '-').toLowerCase();
    const eventTitle = `E2E Event ${uniqueTag} ${Date.now()}`;
    const startDate = buildDateOffset(1, 10, 0);
    const endDate = buildDateOffset(2, 18, 0);

    await login(page, 'admin@bazarpro.de', '123456');
    await page.goto('/my-events');
    await page.getByRole('button', { name: 'Neue Veranstaltung' }).click();

    await fillEventWizard(page, {
      title: eventTitle,
      description: 'Dies ist eine E2E-Testveranstaltung mit Details.',
      location: 'München',
      start: formatDateTimeLocal(startDate),
      end: formatDateTimeLocal(endDate),
      category: 'Sport',
      contact: 'Demo Veranstalter\ninfo@bazarpro.de',
    });
    await expect(page.getByText('Veranstaltung erfolgreich erstellt')).toBeVisible();
    // A new event opens right away and becomes the chosen one in the overview
    await page.waitForURL(/\/events\/view\/[^/]+/);
    const eventId = extractEventId(page.url());
    await page.goto('/');
    await expect(
      page.getByTestId('current-event').getByRole('heading', { name: eventTitle })
    ).toBeVisible();
    await page
      .getByTestId('current-event')
      .getByRole('button', { name: 'Zur Veranstaltung' })
      .click();
    await page.waitForURL(`**/events/view/${eventId}`);
    await approveEventByTitle(page, eventTitle);

    const sellerContext = await browser.newContext();
    const sellerPage = await sellerContext.newPage();
    await login(sellerPage, 'seller@bazarpro.de', '123456');
    await sellerPage.goto(`/public-events/${eventId}`);
    await expect(sellerPage.getByRole('button', { name: 'Als Verkäufer beitreten' })).toBeVisible();
    await sellerPage.getByRole('button', { name: 'Als Verkäufer beitreten' }).click();
    // Seed users have no phone number, so the dialog may ask for contact data first
    const firstNameField = sellerPage.getByRole('textbox', { name: 'Vorname' });
    if (await firstNameField.isVisible({ timeout: 5000 }).catch(() => false)) {
      await fillProfileForm(sellerPage);
    }
    await sellerPage.getByRole('button', { name: 'Anmelden bestätigen' }).click();
    await expect(sellerPage.getByText(/^Anmeldung erfolgreich!/)).toBeVisible();

    // Navigate to Dashboard and then to Sellers
    await page.goto(`/events/view/${eventId}`);
    const participantsButton = page
      .getByRole('navigation')
      .getByRole('button', { name: 'Teilnehmer' });
    await expect(participantsButton).toBeVisible();
    await participantsButton.click();

    await page.waitForURL('**/sellers');
    await expect(page.getByRole('heading', { name: 'Teilnehmer & Helfer' })).toBeVisible();
    const sellerRow = page.getByRole('row', { name: /Demo Seller/i });
    await expect(sellerRow).toBeVisible();
    await sellerRow.getByRole('button', { name: 'Zum Helfer ernennen' }).click();
    await page.getByRole('button', { name: 'Als Helfer ernennen' }).click();
    await expect(page.getByText('wurde als Helfer hinzugefügt')).toBeVisible();

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
