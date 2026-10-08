import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api } from '../_generated/api';

describe('password reset', () => {
  test('answers like a successful request for an unknown email', async () => {
    const t = convexTest(schema);
    const result = await t.action(api.auth.signIn, {
      provider: 'password',
      params: { email: 'unknown@example.com', flow: 'reset' },
    });
    // A sent reset code also ends with `signInViaProvider(...) === null`, so both
    // cases return the same `{ tokens: null }` and the API does not reveal accounts
    expect(result).toEqual({ tokens: null });
  });

  test('still rejects deleted accounts', async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {
        name: 'Deleted',
        email: 'deleted@example.com',
        status: 'deleted',
      });
      await ctx.db.insert('authAccounts', {
        userId,
        provider: 'password',
        providerAccountId: 'deleted@example.com',
      });
    });
    await expect(
      t.action(api.auth.signIn, {
        provider: 'password',
        params: { email: 'deleted@example.com', flow: 'reset' },
      })
    ).rejects.toThrow('ACCOUNT_DELETED');
  });
});
