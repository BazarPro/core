import { test, expect, type Page } from '@playwright/test';
import { runBackend } from '../utils';
import { ORGANIZER, createShowcase, login, loginAs } from '../helpers/features';

/**
 * The cash desk without internet. Only the app sells offline; the browser does it with the
 * test flag (lib/offlineCheckout.ts). Two desks sell the same item while offline: the
 * first one to come back books it, the second one's sale becomes a conflict.
 */

test.beforeAll(() => {
  runBackend('featureFlags.set', { key: 'is_e2e_auth_skip_email', value: true });
});

test.describe.configure({ timeout: 120_000 });

async function openOfflineDesk(page: Page, eventId: string) {
  await page.evaluate(() => localStorage.setItem('bazarpro:offline-checkout', '1'));
  await page.goto(`/events/view/${eventId}/checkout`);
  // Online, the desk takes its copy of the items first
  await expect(page.getByText(/Offline bereit/)).toBeVisible();
}

async function sellOffline(page: Page, productId: string) {
  await page.context().setOffline(true);
  await expect(page.getByText('Offline – die Kasse verkauft weiter')).toBeVisible({
    timeout: 15_000,
  });
  await page.getByLabel('Artikel-Code').fill(productId);
  await page.getByLabel('Artikel-Code').press('Enter');
  await expect(page.getByTestId('checkout-line')).toContainText('Faltrad Brompton M6L');
  await page.getByLabel('600,00 € erhalten').click();
  await page.getByRole('button', { name: 'Verkauf abschließen' }).click();
  await expect(page.getByText(/offline gespeichert/)).toBeVisible();
  await expect(page.getByText('1 Verkauf wartet aufs Nachbuchen.')).toBeVisible();
}

test('two offline desks sell the same item: one is booked, the other is a conflict', async ({
  page,
}, testInfo) => {
  const showcase = createShowcase(testInfo, 'Offline');
  await login(page, ORGANIZER);
  const second = await loginAs(page, ORGANIZER);
  await openOfflineDesk(page, showcase.eventId);
  await openOfflineDesk(second, showcase.eventId);

  await sellOffline(page, showcase.products.folding);
  await sellOffline(second, showcase.products.folding);

  await page.context().setOffline(false);
  await expect(page.getByText('1 Offline-Verkauf nachgebucht')).toBeVisible({ timeout: 30_000 });
  await second.context().setOffline(false);
  await expect(
    second.getByText('1 Artikel konnte nicht gebucht werden – siehe Kassenabgleich.')
  ).toBeVisible({ timeout: 30_000 });

  await page.goto(`/events/view/${showcase.eventId}/cash`);
  await expect(page.getByText('1 Offline-Verkauf konnte nicht gebucht werden')).toBeVisible();
  await expect(page.getByText('An einer anderen Kasse schon verkauft')).toBeVisible();
  await page.getByRole('button', { name: 'Erledigt' }).click();
  await expect(page.getByText('1 Offline-Verkauf konnte nicht gebucht werden')).toHaveCount(0);

  await second.context().close();
});
