import { test, expect, type Page } from '@playwright/test';
import { runBackend } from '../utils';
import { ORGANIZER, createShowcase, login } from '../helpers/features';

/**
 * The event team without internet beyond the cash desk: pages show what was loaded for
 * the bazaar (lib/offlinePrefetch.ts), the intake queues what it does and replays it
 * once online (lib/offlineActions.ts). The browser does this with the test flag only.
 */

test.beforeAll(() => {
  runBackend('featureFlags.set', { key: 'is_e2e_auth_skip_email', value: true });
});

test.describe.configure({ timeout: 120_000 });

/** Client-side navigation: offline the browser cannot load a page again. */
async function openInApp(page: Page, path: string) {
  await page.evaluate((target) => {
    window.history.pushState({}, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

test('the team accepts items and reads product pages offline, the intake is replayed', async ({
  page,
}, testInfo) => {
  const showcase = createShowcase(testInfo, 'OfflineTeam');
  await page.addInitScript(() => localStorage.setItem('bazarpro:offline-checkout', '1'));
  await login(page, ORGANIZER);

  await page.goto(`/events/view/${showcase.eventId}`);
  await expect(page.getByText(/Offline bereit · \d+ Artikel/)).toBeVisible({ timeout: 30_000 });
  await page.goto(`/events/view/${showcase.eventId}/products?tab=all`);
  const youthBike = page
    .getByRole('tabpanel')
    .getByRole('listitem')
    .filter({ hasText: 'Jugendrad Cube Acid 240' });
  await expect(youthBike).toBeVisible();

  await page.context().setOffline(true);
  await expect(page.getByText(/Offline – du siehst den zuletzt geladenen Stand/)).toBeVisible({
    timeout: 15_000,
  });

  // Intake offline: kept on the device and shown right away
  await youthBike.getByRole('button', { name: 'Annehmen', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Annehmen' }).click();
  await expect(page.getByText(/Offline gespeichert/).first()).toBeVisible();
  await expect(youthBike.getByText('Erhältlich', { exact: true })).toBeVisible();
  await expect(page.getByText('1 Offline-Aktion wartet aufs Nachholen.')).toBeVisible();

  // A product page that was never opened, with its questions
  await openInApp(page, `/products/view/${showcase.products.trekking}`);
  await expect(page.getByText('Fragen zum Artikel')).toBeVisible();
  await expect(page.getByText('Ist das Licht dabei und funktioniert es?')).toBeVisible();

  // Back online: the intake is done by the backend
  await openInApp(page, `/events/view/${showcase.eventId}/products?tab=all`);
  await expect(youthBike).toBeVisible();
  await page.context().setOffline(false);
  await expect(page.getByText('1 Offline-Aktion nachgeholt')).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(youthBike.getByText('Erhältlich', { exact: true })).toBeVisible();
  await expect(page.getByText(/Offline-Aktion wartet/)).toHaveCount(0);
});
