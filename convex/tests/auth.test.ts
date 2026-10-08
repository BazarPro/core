import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import { Scrypt } from 'lucia';
import schema from '../schema';
import { api } from '../_generated/api';

// Scrypt hashing is slow under coverage instrumentation on CI runners
const SCRYPT_TEST_TIMEOUT = 60_000;

type TestConvex = ReturnType<typeof convexTest>;

function signIn(t: TestConvex, params: Record<string, string>) {
  return t.action(api.auth.signIn, { provider: 'password', params });
}

async function seedPasswordUser(
  t: TestConvex,
  email: string,
  options: { status?: 'active' | 'deleted' | 'banned'; password?: string } = {}
) {
  const secret = options.password ? await new Scrypt().hash(options.password) : undefined;
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { name: 'User', email, status: options.status });
    await ctx.db.insert('authAccounts', {
      userId,
      provider: 'password',
      providerAccountId: email,
      secret,
      emailVerified: email,
    });
    return userId;
  });
}

describe('password reset', () => {
  test('answers like a successful request for an unknown email', async () => {
    const t = convexTest(schema);
    const result = await signIn(t, { email: 'unknown@example.com', flow: 'reset' });
    // A sent reset code also ends with `signInViaProvider(...) === null`, so both
    // cases return the same `{ tokens: null }` and the API does not reveal accounts
    expect(result).toEqual({ tokens: null });
  });

  test('still rejects deleted accounts', async () => {
    const t = convexTest(schema);
    await seedPasswordUser(t, 'deleted@example.com', { status: 'deleted' });
    await expect(signIn(t, { email: 'deleted@example.com', flow: 'reset' })).rejects.toThrow(
      'ACCOUNT_DELETED'
    );
  });

  test('requires a valid new password to complete the reset', async () => {
    const t = convexTest(schema);
    await expect(
      signIn(t, { email: 'a@example.com', code: '123456', flow: 'reset-verification' })
    ).rejects.toThrow('Invalid password');
  });

  test('rejects a wrong reset code', async () => {
    const t = convexTest(schema);
    await seedPasswordUser(t, 'reset@example.com');
    await expect(
      signIn(t, {
        email: 'reset@example.com',
        code: 'WRONG1',
        newPassword: 'neues-Passwort-123',
        flow: 'reset-verification',
      })
    ).rejects.toThrow();
  });
});

describe('password sign-up and sign-in', () => {
  test('rejects passwords shorter than 8 characters on sign-up', async () => {
    const t = convexTest(schema);
    await expect(
      signIn(t, { email: 'new@example.com', password: 'kurz', flow: 'signUp' })
    ).rejects.toThrow('Invalid password');
  });

  test('requires a password to sign in', async () => {
    const t = convexTest(schema);
    await expect(signIn(t, { email: 'a@example.com', flow: 'signIn' })).rejects.toThrow(
      'Missing `password` param'
    );
  });

  test('rejects unknown emails and wrong passwords', { timeout: SCRYPT_TEST_TIMEOUT }, async () => {
    const t = convexTest(schema);
    await seedPasswordUser(t, 'user@example.com', { password: 'richtiges-Passwort' });
    await expect(
      signIn(t, { email: 'nobody@example.com', password: 'egal-12345', flow: 'signIn' })
    ).rejects.toThrow();
    await expect(
      signIn(t, { email: 'user@example.com', password: 'falsches-Passwort', flow: 'signIn' })
    ).rejects.toThrow();
  });

  test(
    'rejects deleted and banned users with correct password',
    { timeout: SCRYPT_TEST_TIMEOUT },
    async () => {
      const t = convexTest(schema);
      await seedPasswordUser(t, 'gone@example.com', {
        status: 'deleted',
        password: 'passwort-123',
      });
      await seedPasswordUser(t, 'banned@example.com', {
        status: 'banned',
        password: 'passwort-123',
      });
      await expect(
        signIn(t, { email: 'gone@example.com', password: 'passwort-123', flow: 'signIn' })
      ).rejects.toThrow('ACCOUNT_DELETED');
      await expect(
        signIn(t, { email: 'banned@example.com', password: 'passwort-123', flow: 'signIn' })
      ).rejects.toThrow('ACCOUNT_BANNED');
    }
  );

  test('blocks email verification for banned users', async () => {
    const t = convexTest(schema);
    await seedPasswordUser(t, 'banned2@example.com', { status: 'banned' });
    await expect(
      signIn(t, { email: 'banned2@example.com', flow: 'email-verification' })
    ).rejects.toThrow('ACCOUNT_BANNED');
  });

  test('rejects an unknown flow', async () => {
    const t = convexTest(schema);
    await expect(signIn(t, { email: 'a@example.com', flow: 'magic' })).rejects.toThrow(
      'Missing `flow` param'
    );
  });
});
