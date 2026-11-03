import { test, expect } from '@playwright/test';

test('past events stay visible when toggling them on and off repeatedly', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('checkbox', { name: 'Vergangene anzeigen' });
  const firstCard = page.locator('[data-landing-event-card]').first();
  const past = page.locator('[data-landing-event-card]', { hasText: 'BEENDET' });

  for (let round = 0; round < 2; round++) {
    await toggle.check();
    await expect(past.first()).toBeVisible();
    // Past events come first, and the row has to start with them
    await expect(firstCard).toContainText('BEENDET');
    await expect(firstCard).toBeInViewport();

    await toggle.uncheck();
    await expect(past).toHaveCount(0);
    await expect(firstCard).toBeInViewport();
  }
});
