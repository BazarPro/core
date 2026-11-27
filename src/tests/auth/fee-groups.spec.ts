import { test, expect } from '@playwright/test';
import { runBackend } from '../utils';
import {
  OTHER_BUYER,
  ORGANIZER,
  createShowcase,
  expectToast,
  login,
  loginAs,
} from '../helpers/features';

/**
 * Fee groups (#302): the organizer sets up a group, a seller says they belong to it when
 * registering, and the intake checks it before the first item.
 */

test.beforeAll(() => {
  runBackend('featureFlags.set', { key: 'is_e2e_auth_skip_email', value: true });
});

test.describe.configure({ timeout: 120_000 });

test('a self-declared fee group is chosen at registration and checked at the intake', async ({
  page,
}, testInfo) => {
  const showcase = createShowcase(testInfo, 'FeeGroups');

  // The showcase runs already: only the platform admin may still change its fees
  await login(page, 'admin@bazarpro.de');
  await page.goto(`/events/view/${showcase.eventId}/settings?tab=fees`);
  await page.getByRole('button', { name: 'Gebührengruppe hinzufügen' }).click();
  await page.getByLabel('Name der Gruppe').fill('Vereinsmitglieder');
  await page.getByLabel('Provision', { exact: true }).last().fill('5');
  await page.getByLabel('Nachweis (optional)').fill('Mitgliedsausweis zeigen');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expectToast(page, 'Basar gespeichert');

  // The seller sees the group in the conditions and chooses it
  const seller = await loginAs(page, OTHER_BUYER);
  await seller.goto(`/public-events/${showcase.eventId}`);
  await seller.getByRole('button', { name: 'Als Verkäufer anmelden' }).click();
  const dialog = seller.getByRole('dialog');
  // The demo buyer has neither phone nor address; nobody else registers them in parallel
  const confirm = dialog.getByRole('button', { name: 'Anmelden bestätigen' });
  const phone = dialog.getByRole('textbox', { name: 'Telefonnummer' });
  await expect(confirm.or(phone)).toBeVisible();
  if (await phone.isVisible()) {
    await phone.fill('0123456789');
    await dialog.getByRole('button', { name: 'Weiter' }).click();
  }
  const street = dialog.getByRole('textbox', { name: 'Straße und Hausnummer' });
  await expect(confirm.or(street)).toBeVisible();
  if (await street.isVisible()) {
    await street.fill('Musterstraße 1');
    await dialog.getByRole('textbox', { name: 'Postleitzahl' }).fill('89073');
    await dialog.getByRole('textbox', { name: 'Ort' }).fill('Ulm');
    await dialog.getByRole('button', { name: 'Adresse speichern' }).click();
  }
  await expect(confirm).toBeVisible();
  await expect(dialog.getByTestId('fee-groups')).toContainText(
    'Vereinsmitglieder: 5 % Provision statt 10 %'
  );
  await dialog.getByTestId('fee-group-choice').getByText('Vereinsmitglieder').click();
  await dialog.getByRole('button', { name: 'Anmelden bestätigen' }).click();
  await expect(seller.getByText(/^Anmeldung erfolgreich!/)).toBeVisible();
  await seller.goto(`/public-events/${showcase.eventId}`);
  await expect(seller.getByTestId('my-fee-group')).toContainText('Deine Gruppe: Vereinsmitglieder');
  await expect(seller.getByTestId('my-fee-group')).toContainText('prüft deine Angabe');

  // The organizer sees the unchecked self-declaration and confirms it at the intake
  const organizer = await loginAs(page, ORGANIZER);
  await organizer.goto(`/events/view/${showcase.eventId}/sellers`);
  await organizer
    .getByRole('combobox', { name: 'Nach Gebührengruppe filtern' })
    .selectOption({ label: 'Vereinsmitglieder (1 prüfen)' });
  await expect(organizer.getByText('1 Selbstauskunft ist noch nicht geprüft')).toBeVisible();
  const row = organizer.getByRole('row', { name: /Vereinsmitglieder · prüfen/ });
  await row.click();
  const check = organizer.getByTestId('fee-group-check');
  await expect(check).toContainText('Ermäßigt: Vereinsmitglieder – Nachweis prüfen');
  await expect(check).toContainText('Mitgliedsausweis zeigen');
  await check.getByRole('button', { name: 'Bestätigen' }).click();
  await expectToast(organizer, 'Vereinsmitglieder bestätigt');
  await expect(check).toBeHidden();

  await seller.reload();
  await expect(seller.getByTestId('my-fee-group')).toContainText('Vom Team bestätigt');

  // The seller's "…" menu changes the group, here back to no group
  const badge = organizer.getByTitle('Gebührengruppe', { exact: true });
  await expect(badge).toHaveText('Vereinsmitglieder');
  await organizer.getByRole('button', { name: /^Weitere Aktionen für / }).click();
  await organizer.getByRole('menuitem', { name: 'Gebührengruppe zuordnen' }).click();
  await organizer.getByRole('menuitemradio', { name: 'Keine Gruppe' }).click();
  await expectToast(organizer, /: keine Gruppe$/);
  await expect(badge).toBeHidden();
});
