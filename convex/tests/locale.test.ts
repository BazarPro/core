import { expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api } from '../_generated/api';

test('the chosen language is saved at the account', async () => {
  const t = convexTest(schema);
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Anna', email: 'a@test.de' }));
  await t.withIdentity({ subject: userId }).mutation(api.users.setMyLocale, { locale: 'en' });
  expect((await t.run((ctx) => ctx.db.get(userId)))?.locale).toBe('en');
  // Without login nothing happens
  await t.mutation(api.users.setMyLocale, { locale: 'de' });
  expect((await t.run((ctx) => ctx.db.get(userId)))?.locale).toBe('en');
});
