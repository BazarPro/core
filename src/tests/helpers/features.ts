import { expect, type Page, type TestInfo } from '@playwright/test';
import { runConvexCommandWithOutput } from '../utils';

export const PASSWORD = '123456';
export const ORGANIZER = 'user1@bazarpro.de';
export const SELLER = 'seller@bazarpro.de';
// Showcase-only accounts; profile.spec changes user4/user5 in parallel
export const BUYER = 'kaeufer1@bazarpro.de';
export const OTHER_BUYER = 'kaeufer2@bazarpro.de';
export const RETURN_SELLER = 'user3@bazarpro.de';

export interface Showcase {
  eventId: string;
  walkInId: string;
  products: {
    trekking: string;
    mtb: string;
    city: string;
    kids: string;
    road: string;
    balance: string;
    ebike: string;
    holland: string;
    folding: string;
  };
}

/**
 * Creates a fresh running event with every feature switched on (see seed.ts
 * insertFeatureShowcase). Each test gets its own, so parallel browsers do not collide.
 */
export function createShowcase(testInfo: TestInfo, name: string): Showcase & { title: string } {
  const tag = testInfo.project.name.replace(/\s+/g, '-').toLowerCase();
  const title = `E2E ${name} ${tag} ${Date.now()}`;
  const output = runConvexCommandWithOutput(
    'run seed:createFeatureShowcase',
    `'${JSON.stringify({ title })}'`
  );
  return { ...(JSON.parse(output.slice(output.indexOf('{'))) as Showcase), title };
}

export async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'E-Mail-Adresse' }).fill(email);
  await page.getByRole('textbox', { name: 'Passwort' }).fill(PASSWORD);
  await page.getByTestId('button-login-submit').click();
  await page.waitForURL('**/browse-events');
}

/** Logs in in a separate browser context, e.g. to act as buyer next to the seller. */
export async function loginAs(page: Page, email: string) {
  const context = await page.context().browser()!.newContext();
  const other = await context.newPage();
  await login(other, email);
  return other;
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.getByText(text).first()).toBeVisible();
}
