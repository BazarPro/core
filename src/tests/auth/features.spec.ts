import { test, expect, type Page } from '@playwright/test';
import { runBackend } from '../utils';
import {
  BUYER,
  ORGANIZER,
  OTHER_BUYER,
  RETURN_SELLER,
  SELLER,
  createShowcase,
  expectToast,
  login,
  loginAs,
} from '../helpers/features';

/**
 * End-to-end tests for the organizer-selectable features (discounts, price offers,
 * minimum price, questions), internal notes, walk-in sellers, category fields and the
 * editing rules for running events and returned items. Every test creates its own
 * running showcase event, so the browsers can run in parallel.
 */

test.beforeAll(() => {
  runBackend('featureFlags.set', { key: 'is_e2e_auth_skip_email', value: true });
});

test.describe.configure({ timeout: 120_000 });

async function openProductInManagement(page: Page, eventId: string, productId: string) {
  await page.goto(`/events/view/${eventId}/products?q=${productId}&tab=all`);
  await expect(page.getByRole('heading', { name: 'Produkt-Management' })).toBeVisible();
}

test.describe('event settings', () => {
  test('organizer sees the current settings and edits the discount start of a running event', async ({
    page,
  }, testInfo) => {
    const showcase = createShowcase(testInfo, 'Settings');
    await login(page, ORGANIZER);

    await page.goto(`/events/view/${showcase.eventId}/settings`);
    const summary = page.getByTestId('event-settings-summary');
    await expect(summary).toContainText('10 %');
    await expect(summary).toContainText('Artikel rabattieren');
    await expect(summary).toContainText('höchstens 30 %');
    await expect(summary).toContainText('Preisvorschläge online');
    await expect(summary).toContainText('Fragen an den Verkäufer');

    await page.getByRole('button', { name: 'Einstellungen bearbeiten' }).click();
    await expect(page.getByText('Die Veranstaltung läuft gerade.')).toBeVisible();
    await expect(page.locator('#startDate')).toHaveAttribute('readonly', '');
    await expect(page.locator('#commission')).toHaveAttribute('readonly', '');

    // Discounts from the next full hour, maximum 25 %
    const start = new Date();
    start.setHours(start.getHours() + 1, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    const local = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:00`;
    await page.locator('#discountStartsAt').fill(local);
    await page.locator('#maxDiscountPercent').fill('25');
    await page.getByRole('button', { name: 'Speichern' }).click();

    await expectToast(page, 'Veranstaltung erfolgreich aktualisiert');
    await page.goto(`/events/view/${showcase.eventId}/settings`);
    await expect(summary).toContainText(`${pad(start.getHours())}:00 Uhr`);
    await expect(summary).toContainText('höchstens 25 %');
  });

  test('participants list shows the sellers of the event, including walk-ins', async ({
    page,
  }, testInfo) => {
    const showcase = createShowcase(testInfo, 'Participants');
    await login(page, ORGANIZER);
    await page.goto(`/events/view/${showcase.eventId}/sellers`);
    await expect(page.getByText('Demo Seller').first()).toBeVisible();
    await expect(page.getByText('Erika Muster').first()).toBeVisible();
    await expect(page.getByText('Vor Ort angelegt').first()).toBeVisible();
  });
});

test.describe('price offers', () => {
  test('buyer offers, seller accepts, cash desk sells at the agreed price', async ({
    page,
  }, testInfo) => {
    const showcase = createShowcase(testInfo, 'Offers');
    const productPath = `/products/view/${showcase.products.trekking}`;

    // A second buyer offers below the discounted price (420 € - 10 % = 378 €)
    const buyer = await loginAs(page, OTHER_BUYER);
    await buyer.goto(productPath);
    await expect(buyer.getByRole('heading', { name: 'Preis vorschlagen' })).toBeVisible();
    await buyer.getByLabel(/Dein Preis/).fill('370');
    await buyer.getByRole('button', { name: 'Vorschlag senden' }).click();
    await expectToast(buyer, 'Dein Vorschlag wurde an den Verkäufer geschickt.');
    await expect(buyer.getByText('Wartet auf Antwort')).toBeVisible();

    // Seller sees both offers (seeded 360 € and the new 370 €) and accepts 370 €
    const seller = await loginAs(page, SELLER);
    await seller.goto(productPath);
    const offers = seller.getByRole('heading', { name: 'Preisvorschläge' }).locator('../..');
    await expect(offers.getByText('360,00 €')).toBeVisible();
    const offer370 = offers.locator('li').filter({ hasText: '370,00 €' });
    await offer370.getByRole('button', { name: 'Annehmen' }).click();
    await expectToast(seller, 'Vorschlag angenommen');
    await expect(offers.getByText('360,00 €')).toHaveCount(0);

    // The other buyer's offer was rejected automatically
    const firstBuyer = await loginAs(page, BUYER);
    await firstBuyer.goto(productPath);
    await expect(firstBuyer.getByText('Abgelehnt')).toBeVisible();

    // Organizer sells with the accepted offer
    await login(page, ORGANIZER);
    await openProductInManagement(page, showcase.eventId, showcase.products.trekking);
    await page.getByRole('button', { name: 'Verkaufen', exact: true }).first().click();
    await page.getByRole('radio', { name: /Angenommener Vorschlag/ }).click();
    await expect(page.getByText('370,00 €').last()).toBeVisible();
    await page.getByLabel(/erhalten/).click();
    await page.getByRole('button', { name: 'Verkauf abschließen' }).click();
    await expect(page.getByText('Verkauf erfolgreich!')).toBeVisible();

    await buyer.context().close();
    await seller.context().close();
    await firstBuyer.context().close();
  });

  test('cash desk negotiates down to the minimum price, not below', async ({ page }, testInfo) => {
    const showcase = createShowcase(testInfo, 'Negotiate');
    await login(page, ORGANIZER);
    await openProductInManagement(page, showcase.eventId, showcase.products.trekking);
    await page.getByRole('button', { name: 'Verkaufen', exact: true }).first().click();

    await page.getByRole('radio', { name: /Verhandelt \(ab 350,00 €\)/ }).click();
    const price = page.getByLabel('Verhandelter Preis');
    await price.fill('340');
    await expect(page.getByText('Erlaubt sind 350,00 € bis 378,00 €.')).toBeVisible();
    await page.getByLabel(/erhalten/).click();
    await expect(page.getByRole('button', { name: 'Verkauf abschließen' })).toBeDisabled();

    await price.fill('355');
    await page.getByLabel(/erhalten/).click();
    await page.getByLabel(/Beleg per E-Mail/).fill('kaeufer@example.com');
    await page.getByRole('button', { name: 'Verkauf abschließen' }).click();
    await expect(page.getByText('Verkauf erfolgreich!')).toBeVisible();
  });

  test('buyers never see the minimum price', async ({ page }, testInfo) => {
    const showcase = createShowcase(testInfo, 'Minimum');
    await login(page, BUYER);
    await page.goto(`/products/view/${showcase.products.trekking}`);
    await expect(page.getByText('Rahmennummer')).toBeVisible();
    // As a price ("350,00 €"); titles of other test events may contain the digits
    await expect(page.getByText(/350,00/)).toHaveCount(0);
  });
});

test.describe('questions', () => {
  test('buyer asks publicly, seller answers, everyone sees the answer', async ({
    page,
  }, testInfo) => {
    const showcase = createShowcase(testInfo, 'Questions');
    const productPath = `/products/view/${showcase.products.trekking}`;
    const question = `Passt ein Kindersitz? ${Date.now()}`;

    await login(page, BUYER);
    await page.goto(productPath);
    await expect(page.getByText('Ist das Licht dabei und funktioniert es?')).toBeVisible();
    await page.getByPlaceholder('Deine Frage an den Verkäufer (für alle sichtbar)').fill(question);
    await page.getByRole('button', { name: 'Frage stellen' }).click();
    await expectToast(page, 'Deine Frage wurde an den Verkäufer geschickt.');

    const seller = await loginAs(page, SELLER);
    await seller.goto(productPath);
    const item = seller.locator('li').filter({ hasText: question });
    await item
      .getByPlaceholder('Deine Antwort (für alle sichtbar)')
      .fill('Ja, Gepäckträger passt.');
    await item.getByRole('button', { name: 'Antworten' }).click();
    await expectToast(seller, 'Antwort gespeichert');

    await page.reload();
    await expect(
      page.locator('li').filter({ hasText: question }).getByText('Ja, Gepäckträger passt.')
    ).toBeVisible();
    await seller.context().close();
  });
});

test.describe('discounts and editing rules', () => {
  test('accepted items are locked and discountable; returned items are editable without discount', async ({
    page,
  }, testInfo) => {
    const showcase = createShowcase(testInfo, 'Editing');
    await login(page, RETURN_SELLER);

    // Kinderrad is handed in (available, 20 % discount)
    await page.goto(`/products/view/${showcase.products.kids}`);
    await expect(page.getByText(/Gesperrt, solange das Produkt/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bearbeiten' })).toBeDisabled();
    await page.getByRole('button', { name: 'Rabatt anpassen' }).click();
    await expect(page.getByText('Maximal 30% Rabatt sind erlaubt.')).toBeVisible();
    await page.getByRole('button', { name: 'Abbrechen' }).click();

    // Laufrad was returned: editable again, no discount
    await page.goto(`/products/view/${showcase.products.balance}`);
    await expect(page.getByText(/Gesperrt, solange das Produkt/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Rabatt anpassen' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Bearbeiten' }).click();
    await page.waitForURL(`**/products/edit/${showcase.products.balance}`);
    await expect(page.getByLabel('Laufradgröße')).toHaveValue('12 Zoll');
    await page.getByLabel('Preis (€) *').fill('99');
    await page.getByRole('button', { name: 'Änderungen speichern' }).click();
    await expectToast(page, 'Produkt erfolgreich aktualisiert');

    await page.goto(`/products/view/${showcase.products.balance}`);
    await expect(page.getByText('99,00 €').first()).toBeVisible();

    // The return is still recorded for the organizer
    const organizer = await loginAs(page, ORGANIZER);
    await openProductInManagement(organizer, showcase.eventId, showcase.products.balance);
    await expect(organizer.getByText('Laufrad Woom 1')).toBeVisible();
    await expect(organizer.getByText('Zurückgegeben').first()).toBeVisible();
    await organizer.context().close();
  });

  test('seller discounts an available item within the event maximum', async ({
    page,
  }, testInfo) => {
    const showcase = createShowcase(testInfo, 'Discount');
    await login(page, SELLER);
    await page.goto(`/products/view/${showcase.products.mtb}`);
    await page.getByRole('button', { name: 'Rabatt anpassen' }).click();

    const slider = page.locator('#discount-slider');
    await expect(slider).toHaveAttribute('max', '30');
    // Drag the thumb across the track
    const box = (await slider.boundingBox())!;
    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 15 });
    await page.mouse.up();
    await expect(page.getByText('Rabatt: 20%')).toBeVisible();

    await page.getByRole('button', { name: 'Rabatt speichern' }).click();
    await page.getByRole('button', { name: 'Ja, Rabatt anwenden' }).click();
    await expectToast(page, 'Rabatt erfolgreich aktualisiert');
    await expect(page.getByText('-20% Rabatt')).toBeVisible();
    await expect(page.getByText('304,00 €')).toBeVisible();
  });
});

test.describe('organizer tools', () => {
  test('walk-in seller: create, record an item with category fields, accept with note', async ({
    page,
  }, testInfo) => {
    const showcase = createShowcase(testInfo, 'Walkin');
    const itemTitle = `Hollandrad Batavus ${Date.now()}`;
    await login(page, ORGANIZER);

    await page.goto(`/events/view/${showcase.eventId}/sellers`);
    await page.getByRole('button', { name: 'Verkäufer ohne Konto' }).click();
    await page.getByLabel('Vorname *').fill('Max');
    await page.getByLabel('Nachname *').fill('Vorort');
    await page.getByLabel('Telefon').fill('0170 1234567');
    await page.getByRole('button', { name: 'Anlegen' }).click();
    await expectToast(page, 'Max Vorort wurde angelegt');
    await page.waitForURL('**/products?vendor=*');

    await page.getByRole('button', { name: 'Artikel erfassen' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Produktname *').fill(itemTitle);
    await dialog.locator('#condition').click();
    await page.getByRole('option', { name: 'Gebraucht', exact: true }).click();
    await dialog.locator('#categoryId').click();
    await page.getByRole('option', { name: 'Fahrräder' }).click();
    await dialog.getByLabel('Rahmennummer').fill('BAT 123');
    await dialog.getByLabel('Preis (€) *').fill('140');
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expectToast(page, `„${itemTitle}“ erfasst`);

    // The row's button, not "Alle annehmen" in the seller panel
    // Rows of the product list, not the toasts (also list items)
    const card = page.getByRole('tabpanel').getByRole('listitem').filter({ hasText: itemTitle });
    await card.getByRole('button', { name: 'Annehmen', exact: true }).click();
    await page.getByLabel('Interne Notiz (optional)').fill('Schlüssel an Haken 7');
    await page.getByRole('button', { name: 'Annehmen' }).click();
    await expect(page.getByText('Schlüssel an Haken 7').first()).toBeVisible();
    await expect(card).toBeVisible();

    // The note is searchable
    await page.getByPlaceholder('Produkt oder Verkäufer suchen...').fill('Haken 7');
    await expect(page.getByText(itemTitle).first()).toBeVisible();
  });

  test('organizer sees the seller once with a link, plus the internal note', async ({
    page,
  }, testInfo) => {
    const showcase = createShowcase(testInfo, 'OrganizerBox');
    await login(page, ORGANIZER);
    await page.goto(`/events/view/${showcase.eventId}`);
    await page.goto(`/products/view/${showcase.products.trekking}`);

    const box = page.getByRole('heading', { name: 'Veranstalter-Verwaltung' }).locator('../..');
    await expect(box.getByLabel('Interne Notiz')).toHaveValue('Schlüssel an Haken 12');
    await expect(page.getByText('Verkäufer (Nur für Veranstalter sichtbar)')).toHaveCount(0);
    await box.getByRole('button', { name: /Demo Seller/ }).click();
    await page.waitForURL(`**/events/view/${showcase.eventId}/products?vendor=*`);
  });
});

test.describe('category fields', () => {
  test('bike categories show bike fields in the product form, others do not', async ({ page }) => {
    await login(page, SELLER);
    await page.goto('/products/new');
    await page.locator('#categoryId').click();
    await page.getByRole('option', { name: 'Fahrräder' }).click();
    await expect(page.getByLabel('Rahmennummer')).toBeVisible();
    await expect(page.getByText('Bei Rädern ab ca. 500 € dringend empfohlen.')).toBeVisible();

    await page.locator('#categoryId').click();
    await page.getByRole('option', { name: 'Bücher' }).click();
    await expect(page.getByLabel('Rahmennummer')).toHaveCount(0);
  });
});
