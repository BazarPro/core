import { test, expect, type Page } from '@playwright/test';
import { runBackend } from '../utils';
import { ORGANIZER, createShowcase, expectToast, login } from '../helpers/features';

/**
 * The end of a bazaar (#305): the team returns the items left over at once, or the
 * nightly cron does and marks them, so the team can clear up whether they were picked up.
 */

test.beforeAll(() => {
  runBackend('featureFlags.set', { key: 'is_e2e_auth_skip_email', value: true });
});

// The cron step takes every bazaar that is over: one after the other
test.describe.configure({ timeout: 120_000, mode: 'serial' });

/** Screenshots for the pull request, only when asked for */
async function shot(page: Page, name: string) {
  const dir = process.env.SCREENSHOT_DIR;
  if (!dir) return;
  // Dialogs fade in
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${dir}/${name}.png` });
}

test('the team returns what is left after the bazaar at once', async ({ page }, testInfo) => {
  const showcase = createShowcase(testInfo, 'Leftovers');
  runBackend('seed.endEvent', { eventId: showcase.eventId, hoursAgo: 2 });

  await login(page, ORGANIZER);
  await page.goto(`/events/view/${showcase.eventId}/products`);
  const notice = page.getByTestId('leftovers-notice');
  await expect(notice).toContainText('Der Basar ist vorbei:');
  await expect(notice).toContainText('in der kommenden Nacht automatisch');
  await shot(page, 'leftovers-notice');
  if (process.env.SCREENSHOT_DIR) {
    await page.setViewportSize({ width: 390, height: 844 });
    await shot(page, 'leftovers-notice-phone');
    await page.setViewportSize({ width: 1280, height: 720 });
  }

  await notice.getByRole('button', { name: 'Alle übrigen zurückgeben' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('als zurückgegeben markieren?');
  await expect(dialog).toContainText('Verkaufte und nie abgegebene Artikel bleiben');
  await shot(page, 'leftovers-confirm');
  await dialog.getByRole('button', { name: 'Zurückgeben' }).click();
  await expectToast(page, /Artikel zurückgegeben/);
  // Live: nothing left, nothing marked as returned by the cron
  await expect(notice).toBeHidden();
  await expect(page.getByTestId('auto-returned-notice')).toBeHidden();
});

test('the night after, the cron returns the rest and the team clears it up', async ({
  page,
}, testInfo) => {
  const showcase = createShowcase(testInfo, 'Auto return');
  runBackend('seed.endEvent', { eventId: showcase.eventId, hoursAgo: 10 });
  runBackend('retention.returnLeftovers', {});

  await login(page, ORGANIZER);
  await page.goto(`/events/view/${showcase.eventId}/products`);
  const notice = page.getByTestId('auto-returned-notice');
  await expect(notice).toContainText('in der Nacht nach dem Basar automatisch zurückgegeben');
  await expect(page.getByTestId('leftovers-notice')).toBeHidden();
  await shot(page, 'auto-returned-notice');

  await notice.getByRole('button', { name: 'Anzeigen' }).click();
  await expect(page).toHaveURL(/tab=returned/);
  await expect(page.getByRole('button', { name: /Automatisch zurückgegeben/ })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(page.getByText('automatisch', { exact: true }).first()).toBeVisible();
  await shot(page, 'auto-returned-list');

  // "Noch abzuholen" still reaches their sellers
  await notice.getByRole('button', { name: 'Verkäufer anschreiben' }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'Nur Verkäufer mit noch abzuholenden Artikeln'
  );
  await shot(page, 'auto-returned-message');
});

test('the automatic return is on unless the organizer turns it off', async ({ page }, testInfo) => {
  const showcase = createShowcase(testInfo, 'Auto return setting');
  await login(page, ORGANIZER);
  await page.goto(`/events/view/${showcase.eventId}/settings`);
  const toggle = page.getByRole('checkbox', { name: 'Nicht Abgeholtes automatisch zurückgeben' });
  await toggle.scrollIntoViewIfNeeded();
  await expect(toggle).toBeChecked();
  await page.evaluate(() => window.scrollBy(0, -160));
  await shot(page, 'setting');
  await toggle.click();
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expectToast(page, 'Basar gespeichert');
  await page.goto(`/events/view/${showcase.eventId}/settings`);
  await expect(
    page.getByRole('checkbox', { name: 'Nicht Abgeholtes automatisch zurückgeben' })
  ).not.toBeChecked();
});
