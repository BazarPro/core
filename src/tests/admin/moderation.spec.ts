import { test, expect, type Page } from '@playwright/test';
import { runConvexCommand } from '../utils';
import { BUYER, SELLER, createShowcase, expectToast, login, loginAs } from '../helpers/features';

/**
 * Platform moderation: admins manage foreign events like an organizer, users report
 * content, admins decide with a reason and every decision lands in the log. Each test
 * works on its own showcase event, so the shared seed data stays untouched.
 */

const ADMIN = 'admin@bazarpro.de';

test.beforeAll(() => {
  runConvexCommand('run featureFlags:set', `"{ 'key':'is_e2e_auth_skip_email', 'value': true }"`);
});

test.describe.configure({ timeout: 120_000 });

async function decide(page: Page, button: string, reason: string, confirm: string) {
  await page.getByRole('button', { name: button }).first().click();
  await page.locator('#moderation-reason').fill(reason);
  await page.getByRole('button', { name: confirm, exact: true }).click();
}

test('admin manages a foreign event with organizer rights', async ({ page }, testInfo) => {
  const showcase = createShowcase(testInfo, 'Admin Manage');
  await login(page, ADMIN);

  await page.goto('/admin/events');
  await page.getByPlaceholder('Titel, Ort oder Veranstalter').fill(showcase.title);
  await page.getByRole('button', { name: 'Verwalten' }).click();
  await expect(page.getByTestId('admin-event-banner')).toBeVisible();

  // Used to crash with "Not authorized" for admins
  await page.goto(`/events/view/${showcase.eventId}/products`);
  await expect(page.getByRole('heading', { name: 'Produkt-Management' })).toBeVisible();
  await expect(page.getByText('Trekkingrad Cube Touring').first()).toBeVisible();

  await page.goto(`/events/view/${showcase.eventId}/settings`);
  await expect(page.getByRole('button', { name: 'Einstellungen bearbeiten' })).toBeEnabled();
  await page.getByRole('button', { name: 'Einstellungen bearbeiten' }).click();
  await expect(page.getByLabel('Titel der Veranstaltung *')).toHaveValue(showcase.title);
});

test('reported item is hidden with a reason and restored', async ({ page }, testInfo) => {
  const showcase = createShowcase(testInfo, 'Report Item');
  const productPath = `/products/view/${showcase.products.mtb}`;

  // A buyer reports the item
  const buyer = await loginAs(page, BUYER);
  await buyer.goto(productPath);
  await buyer.getByTestId('report-product').click();
  await buyer.getByText('Betrug oder Fälschung').click();
  await buyer.locator('#report-details').fill('Rahmennummer passt nicht, vermutlich gestohlen.');
  await buyer.getByRole('button', { name: 'Meldung senden' }).click();
  await expectToast(buyer, 'Danke für deine Meldung');

  // The admin hides it from the report
  await login(page, ADMIN);
  await page.goto('/admin/reports');
  const report = page.getByTestId('admin-report').filter({ hasText: 'vermutlich gestohlen' });
  await expect(report).toBeVisible();
  await report.getByRole('button', { name: 'Artikel ausblenden' }).click();
  const reason = `Verdacht auf Diebstahl ${showcase.title}`;
  await page.locator('#moderation-reason').fill(reason);
  await page.getByRole('button', { name: 'Ausblenden', exact: true }).click();
  await expectToast(page, 'Artikel ausgeblendet');
  await expect(report).toBeHidden();

  // Gone for the buyer, visible with the reason for the seller
  await buyer.reload();
  await expect(buyer.getByText('Produkt nicht gefunden')).toBeVisible();
  const seller = await loginAs(page, SELLER);
  await seller.goto(productPath);
  await expect(seller.getByTestId('moderation-notice')).toContainText(reason);

  // Logged, and the admin can restore it from the product page
  await page.goto('/admin/log');
  await expect(page.getByRole('row').filter({ hasText: reason })).toBeVisible();
  await page.goto(productPath);
  await page
    .getByTestId('admin-moderation-box')
    .getByRole('button', { name: 'Wieder einblenden' })
    .click();
  await expectToast(page, 'Einschränkung aufgehoben');
  await buyer.reload();
  await expect(buyer.getByRole('heading', { name: /Mountainbike Scott/ })).toBeVisible();

  await buyer.context().close();
  await seller.context().close();
});

test('anonymous visitors report events with an email address', async ({
  page,
  browser,
}, testInfo) => {
  const showcase = createShowcase(testInfo, 'Report Event');

  const context = await browser.newContext();
  const visitor = await context.newPage();
  await visitor.goto(`/public-events/${showcase.eventId}`);
  await visitor.getByTestId('report-event').click();
  await visitor.getByText('Spam oder Werbung').click();
  await visitor.locator('#report-details').fill(`Nur Werbung ${showcase.title}`);
  await expect(visitor.getByRole('button', { name: 'Meldung senden' })).toBeDisabled();
  await visitor.locator('#report-email').fill('finder@example.org');
  await visitor.getByRole('button', { name: 'Meldung senden' }).click();
  await expectToast(visitor, 'Danke für deine Meldung');
  await context.close();

  await login(page, ADMIN);
  await page.goto('/admin/reports');
  const report = page.getByTestId('admin-report').filter({ hasText: showcase.title });
  await expect(report).toContainText('finder@example.org');
  await report.getByRole('button', { name: 'Kein Verstoß' }).click();
  await page.locator('#moderation-reason').fill('Keine Werbung erkennbar');
  await page.getByRole('button', { name: 'Abweisen' }).click();
  await expectToast(page, 'Meldung abgewiesen');

  await page.getByRole('tab', { name: 'Abgewiesen' }).click();
  await expect(page.getByTestId('admin-report').filter({ hasText: showcase.title })).toContainText(
    'Keine Werbung erkennbar'
  );
});

test('admin deletes a question and blocks an event', async ({ page, browser }, testInfo) => {
  const showcase = createShowcase(testInfo, 'Block Event');
  await login(page, ADMIN);

  // Showcase questions are on the trekking bike
  // Moderation tools only appear in the administrator role
  await page.goto(`/products/view/${showcase.products.trekking}`);
  await expect(page.getByRole('button', { name: 'Frage moderieren' })).toHaveCount(0);
  await page
    .getByTestId('product-role-switch')
    .getByRole('button', { name: 'Admin', exact: true })
    .click();
  await expect(page.getByTestId('admin-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Frage moderieren' }).first().click();
  await page.locator('#moderation-reason').fill(`Beleidigender Inhalt ${showcase.title}`);
  await page.getByRole('button', { name: 'Löschen', exact: true }).click();
  await expectToast(page, 'Frage gelöscht');

  await page.goto('/admin/events');
  await page.getByPlaceholder('Titel, Ort oder Veranstalter').fill(showcase.title);
  await decide(page, 'Sperren', `Gefälschte Veranstaltung ${showcase.title}`, 'Sperren');
  await expectToast(page, 'Veranstaltung gesperrt');
  await expect(
    page.getByText(`Gesperrt: Gefälschte Veranstaltung ${showcase.title}`)
  ).toBeVisible();

  const context = await browser.newContext();
  const visitor = await context.newPage();
  await visitor.goto(`/public-events/${showcase.eventId}`);
  await expect(visitor.getByText('Veranstaltung nicht gefunden.')).toBeVisible();
  await context.close();

  await page.goto('/admin/log');
  await expect(
    page.getByRole('row').filter({ hasText: `Beleidigender Inhalt ${showcase.title}` })
  ).toBeVisible();
  await expect(
    page.getByRole('row').filter({ hasText: `Gefälschte Veranstaltung ${showcase.title}` })
  ).toBeVisible();
});
