import { describe, expect, test, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { createOrUpdateUser, type CreateOrUpdateUserArgs } from '../authUsers';

type TestConvex = ReturnType<typeof convexTest>;

async function setFlag(t: TestConvex, key: string, value: boolean) {
  await t.run((ctx) => ctx.db.insert('featureFlags', { key, value }));
}

function callback(t: TestConvex, args: CreateOrUpdateUserArgs) {
  return t.run((ctx) => createOrUpdateUser(ctx, args));
}

const oauthLogin = (email?: string, emailVerified = true): CreateOrUpdateUserArgs => ({
  existingUserId: null,
  type: 'oauth',
  profile: { email, emailVerified, name: 'Max Muster' },
});

describe('createOrUpdateUser', () => {
  test('rejects sign-ins while login is disabled', async () => {
    const t = convexTest(schema);
    await setFlag(t, 'is_login_enabled', false);
    await expect(callback(t, oauthLogin('a@test.com'))).rejects.toThrow(
      'Login is currently disabled.'
    );
  });

  test('rejects deleted and banned users found by id', async () => {
    const t = convexTest(schema);
    const [deletedId, bannedId] = await t.run(async (ctx) => [
      await ctx.db.insert('users', { name: 'D', status: 'deleted' }),
      await ctx.db.insert('users', { name: 'B', status: 'banned' }),
    ]);
    await expect(
      callback(t, { existingUserId: deletedId, type: 'oauth', profile: {} })
    ).rejects.toThrow('ACCOUNT_DELETED');
    await expect(
      callback(t, { existingUserId: bannedId, type: 'oauth', profile: {} })
    ).rejects.toThrow('ACCOUNT_BANNED');
  });

  test('rejects banned users found by email', async () => {
    const t = convexTest(schema);
    await t.run((ctx) =>
      ctx.db.insert('users', { name: 'B', email: 'banned@test.com', status: 'banned' })
    );
    await expect(callback(t, oauthLogin('banned@test.com'))).rejects.toThrow('ACCOUNT_BANNED');
  });

  test('links a verified OAuth login to the existing user with that email', async () => {
    const t = convexTest(schema);
    const userId = await t.run((ctx) =>
      ctx.db.insert('users', { name: 'Existing', email: 'link@test.com' })
    );

    await expect(callback(t, oauthLogin('link@test.com'))).resolves.toBe(userId);

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.isMailConfirmed).toBe(true);
    expect(user?.emailVerificationTime).toBeTypeOf('number');
  });

  test('returns the existing user without confirming an unverified email', async () => {
    const t = convexTest(schema);
    const userId = await t.run((ctx) =>
      ctx.db.insert('users', { name: 'Existing', email: 'plain@test.com' })
    );

    await expect(
      callback(t, {
        existingUserId: null,
        type: 'credentials',
        profile: { email: 'plain@test.com' },
      })
    ).resolves.toBe(userId);

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.isMailConfirmed).toBeUndefined();
  });

  test('rejects new users while registration is disabled', async () => {
    const t = convexTest(schema);
    await setFlag(t, 'is_registration_enabled', false);
    await expect(callback(t, oauthLogin('new@test.com'))).rejects.toThrow(
      'Registration is currently disabled.'
    );
  });

  test('creates a new active user that needs onboarding', async () => {
    const t = convexTest(schema);
    await setFlag(t, 'is_create_products_on_signup_enabled', false);

    const userId = await callback(t, oauthLogin('new@test.com'));

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user).toMatchObject({
      email: 'new@test.com',
      name: 'Max Muster',
      status: 'active',
      systemRole: 'user',
      isMailConfirmed: true,
      needsOnboarding: true,
    });
    const scheduled = await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
    expect(scheduled).toHaveLength(0);
  });

  test('creates unverified users without email confirmation', async () => {
    const t = convexTest(schema);
    await setFlag(t, 'is_create_products_on_signup_enabled', false);

    const userId = await callback(t, {
      existingUserId: null,
      type: 'credentials',
      profile: { email: 'unverified@test.com' },
    });

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.isMailConfirmed).toBe(false);
    expect(user?.emailVerificationTime).toBeUndefined();
  });

  test('schedules starter products for new users when the flag is on', async () => {
    // Keep the scheduled function from running after the test transaction
    vi.useFakeTimers();
    const t = convexTest(schema);

    const userId = await callback(t, oauthLogin('starter@test.com'));

    const scheduled = await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].args).toEqual([{ userId }]);
    vi.useRealTimers();
  });

  test('creates a user when the provider returns no email', async () => {
    const t = convexTest(schema);
    await setFlag(t, 'is_create_products_on_signup_enabled', false);

    const userId = await callback(t, oauthLogin(undefined, false));

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.email).toBeUndefined();
    expect(user?.status).toBe('active');
  });
});
