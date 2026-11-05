import { expect, type Page } from '@playwright/test';

export async function approveEventByTitle(page: Page, eventTitle: string) {
  await page.goto('/admin/events');
  await expect(page.getByRole('heading', { name: 'Basare', exact: true })).toBeVisible();

  // The list is paged: the event may not be on the first page
  await page.getByPlaceholder('Titel, Ort oder Veranstalter').fill(eventTitle);
  const row = page.getByRole('row', { name: new RegExp(eventTitle) });
  await expect(row).toBeVisible();

  const approveButton = row.getByRole('button', { name: 'Freigeben' });
  if (await approveButton.count()) {
    await approveButton.click();
    await expect(page.getByText('Event wurde freigegeben')).toBeVisible();
  }

  await expect(row.getByText('Freigegeben')).toBeVisible();
}
