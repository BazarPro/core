import { test, expect, type Page } from '@playwright/test';
import { approveEventByTitle } from '../helpers/eventApproval';

test.describe('product inventory flow as co-organizer', () => {
  test('seller creates products, adds to event, co-organizer manages inventory', async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(120000);
    const uniqueTag = testInfo.project.name.replace(/\s+/g, '-').toLowerCase();
    const eventTitle = `E2E Event Inventory ${uniqueTag} ${Date.now()}`;
    const productTitleSold = `E2E Produkt Verkauf ${uniqueTag}`;
    const productTitleReturn = `E2E Produkt Rückgabe ${uniqueTag}`;
    const startDate = buildDateOffset(1, 9, 0);
    const endDate = buildDateOffset(2, 18, 0);
    const imagePath = 'public/images/onboarding/dummyproduct-image.png';

    await login(page, 'admin@bazarpro.de', '123456');
    const eventId = await createEvent(page, eventTitle, startDate, endDate);
    await approveEventByTitle(page, eventTitle);

    const sellerContext = await browser.newContext();
    const sellerPage = await sellerContext.newPage();
    await login(sellerPage, 'seller@bazarpro.de', '123456');
    await joinEventAsSeller(sellerPage, eventId);

    await createProductWithEvent(sellerPage, productTitleSold, eventTitle, imagePath);
    await createProductWithEvent(sellerPage, productTitleReturn, eventTitle, imagePath);

    await assignCoOrganizer(page, eventId);

    // Navigate through dashboard
    await sellerPage.goto(`/events/view/${eventId}`);
    const sellerProductsButton = sellerPage
      .getByRole('navigation')
      .getByRole('button', { name: 'Produkte' });
    await expect(sellerProductsButton).toBeVisible();
    await sellerProductsButton.click();

    await sellerPage.waitForURL('**/products');
    await expect(sellerPage.getByRole('heading', { name: 'Produkt-Management' })).toBeVisible();

    await markAvailableAndSell(sellerPage, productTitleSold);
    await markAvailableAndReturn(sellerPage, productTitleReturn);

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
  await page.locator('#description').fill('E2E Inventur-Veranstaltung');
  await page.getByLabel('Ort *').fill('Berlin');
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
  const profileForm = page.getByTestId('join-event-form');
  if (await profileForm.isVisible({ timeout: 5000 }).catch(() => false)) {
    await fillProfileForm(page);
  }
  const confirmJoinButton = page.getByRole('button', { name: 'Anmelden bestätigen' });
  await expect(confirmJoinButton).toBeVisible({ timeout: 10000 });
  await confirmJoinButton.click();
  await expect(page.getByText(/^Anmeldung erfolgreich!/)).toBeVisible();
}

async function fillProfileForm(page: Page) {
  const profileForm = page.getByTestId('join-event-form');
  for (let step = 0; step < 5; step += 1) {
    if (!(await profileForm.isVisible().catch(() => false))) {
      break;
    }

    try {
      const firstNameField = page.getByRole('textbox', { name: 'Vorname' });
      if (await firstNameField.isVisible({ timeout: 500 }).catch(() => false)) {
        await firstNameField.fill('Demo', { timeout: 1000 });
        await page.getByRole('textbox', { name: 'Nachname' }).fill('Seller', { timeout: 1000 });
        await page
          .getByRole('textbox', { name: 'Telefonnummer' })
          .fill('0123456789', { timeout: 1000 });
      }
    } catch {
      // Ignore fill errors (e.g. element detached), try again in next loop
    }

    try {
      const streetField = page.getByRole('textbox', { name: 'Straße und Hausnummer' });
      if (await streetField.isVisible({ timeout: 500 }).catch(() => false)) {
        await streetField.fill('Musterstrasse 1', { timeout: 1000 });
        await page.getByRole('textbox', { name: 'Postleitzahl' }).fill('12345', { timeout: 1000 });
        await page.getByRole('textbox', { name: 'Ort' }).fill('de', { timeout: 1000 });
        await page.getByRole('textbox', { name: 'Land' }).fill('de', { timeout: 1000 });
      }
    } catch {
      // Ignore fill errors, try again in next loop
    }

    const submitButton = profileForm.getByRole('button', { name: /weiter|speichern/i });
    if (await submitButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      try {
        await submitButton.click({ timeout: 2000 });
        await page.waitForTimeout(500); // Allow UI to transition/re-render
      } catch {
        // Ignore click errors (e.g., button disabled or detached), try again
      }
    } else {
      break; // No submit button visible, form might be done
    }
  }
}

async function createProductWithEvent(
  page: Page,
  productTitle: string,
  eventTitle: string,
  imagePath: string
) {
  await page.goto('/products/new');
  await expect(page.getByRole('heading', { name: 'Neues Produkt erstellen' })).toBeVisible();

  await page.getByLabel('Produktname *').fill(productTitle);
  await page.getByLabel('Beschreibung').fill('E2E Produkt für Inventur-Test');

  await page.getByLabel('Zustand *').click();
  await page.getByRole('option', { name: 'Gebraucht, wie neu' }).click();
  await expect(page.locator('#condition')).toContainText('Gebraucht, wie neu');

  await page.getByLabel('Kategorie *').click();
  await page.getByRole('option', { name: 'Sport' }).click();
  await expect(page.locator('#categoryId')).toContainText('Sport');

  await page.getByLabel('Preis (€) *').fill('25');

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(imagePath);
  await expect(page.getByAltText(/Preview/).first()).toBeVisible();

  const eventRow = page.locator('label', { hasText: eventTitle }).first();
  await eventRow.click();
  await expect(eventRow.locator('[data-slot="checkbox"]')).toHaveAttribute('data-state', 'checked');

  await page.getByRole('button', { name: 'Produkt erstellen' }).click();
  await page.waitForURL('**/my-products', { timeout: 60000 });
}

async function assignCoOrganizer(page: Page, eventId: string) {
  // Navigate through dashboard
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
}

async function markAvailableAndSell(page: Page, productTitle: string) {
  const card = page
    .locator('div.bg-card', { has: page.getByRole('heading', { name: productTitle }) })
    .first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Annahme' }).click();
  const acceptDialog = page.getByRole('alertdialog');
  await acceptDialog.getByRole('button', { name: 'Annehmen' }).click();
  await expect(card.getByText('Erhältlich', { exact: true })).toBeVisible();

  await card.getByRole('button', { name: 'Verkauf' }).click();
  const sellDialog = page.getByRole('dialog', { name: 'Verkauf abwickeln' });
  await expect(sellDialog).toBeVisible();
  const paymentConfirmedCheckbox = sellDialog.getByRole('checkbox', {
    name: /Betrag von .* erhalten/,
  });
  await paymentConfirmedCheckbox.click();
  await expect(paymentConfirmedCheckbox).toBeChecked();
  const finalizeSaleButton = sellDialog.getByRole('button', { name: 'Verkauf abschließen' });
  await expect(finalizeSaleButton).toBeEnabled();
  await finalizeSaleButton.click();
  const saleSuccessDialog = page.getByRole('dialog', { name: 'Verkauf erfolgreich!' });
  await expect(saleSuccessDialog).toBeVisible();
  await saleSuccessDialog.getByRole('button', { name: 'Schließen' }).click();
  await expect(card.getByText('Verkauft', { exact: true })).toBeVisible();
}

async function markAvailableAndReturn(page: Page, productTitle: string) {
  const card = page
    .locator('div.bg-card', { has: page.getByRole('heading', { name: productTitle }) })
    .first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Annahme' }).click();
  const acceptDialog = page.getByRole('alertdialog');
  await acceptDialog.getByRole('button', { name: 'Annehmen' }).click();
  await expect(card.getByText('Erhältlich', { exact: true })).toBeVisible();

  await card.getByRole('button', { name: 'Rückgabe' }).click();
  const returnDialog = page.getByRole('dialog', { name: 'Artikel zurückgeben' });
  await expect(returnDialog).toBeVisible();
  const returnConfirmedCheckbox = returnDialog.getByRole('checkbox', {
    name: 'Rückgabe bestätigt',
  });
  await returnConfirmedCheckbox.click();
  await expect(returnConfirmedCheckbox).toBeChecked();
  const finalizeReturnButton = returnDialog.getByRole('button', { name: 'Rückgabe abschließen' });
  await expect(finalizeReturnButton).toBeEnabled();
  await finalizeReturnButton.click();
  const returnSuccessDialog = page.getByRole('dialog', { name: 'Rückgabe erfolgreich!' });
  await expect(returnSuccessDialog).toBeVisible();
  await returnSuccessDialog.getByRole('button', { name: 'Schließen' }).click();
  await expect(card.getByText('Zurückgegeben', { exact: true })).toBeVisible();
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
