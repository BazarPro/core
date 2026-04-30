import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api, internal } from '../_generated/api';
import { Scrypt } from 'lucia';

describe('Convex Users Tests', () => {
  describe('viewer', () => {
    test('returns null if not authenticated', async () => {
      const t = convexTest(schema);
      const result = await t.query(api.users.viewer);
      expect(result).toBeNull();
    });

    test('returns user if authenticated', async () => {
      const t = convexTest(schema);
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', {
          name: 'Test User',
          email: 'test@example.com',
          systemRole: 'user',
        });
      });

      const result = await t.withIdentity({ subject: userId }).query(api.users.viewer);
      expect(result).not.toBeNull();
      expect(result?._id).toBe(userId);
      expect(result?.name).toBe('Test User');
    });
  });

  describe('getUserSystemRole', () => {
    test('returns system role for user', async () => {
      const t = convexTest(schema);
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', {
          name: 'Admin User',
          email: 'admin@example.com',
          systemRole: 'admin',
        });
      });

      const role = await t.query(api.users.getUserSystemRole, { userId });
      expect(role).toBe('admin');
    });

    test('returns undefined for non-existent user', async () => {
      const t = convexTest(schema);
      // Create a dummy ID
      const userId = await t.run(async (ctx) => {
        const id = await ctx.db.insert('users', {
          name: 'Temp',
          email: 'temp@example.com',
        });
        await ctx.db.delete(id);
        return id;
      });

      const role = await t.query(api.users.getUserSystemRole, { userId });
      expect(role).toBeNull();
    });
  });

  describe('profile actions', () => {
    test('update profile', async () => {
      const t = convexTest(schema);
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', { name: 'Old Name', email: 't@t.com' });
      });

      await t.withIdentity({ subject: userId }).mutation(api.users.update, {
        firstName: 'New',
        lastName: 'Name',
        city: 'Ulm',
      });

      const updated = await t.run(async (ctx) => await ctx.db.get(userId));
      expect(updated?.name).toBe('New Name');
      expect(updated?.city).toBe('Ulm');
    });

    test('update profile throws if unauthenticated', async () => {
      const t = convexTest(schema);
      await expect(t.mutation(api.users.update, { firstName: 'New' })).rejects.toThrow(
        'Not authenticated'
      );
    });

    test('remove account', async () => {
      const t = convexTest(schema);
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', { name: 'To Delete', email: 'd@d.com' });
      });

      await t.withIdentity({ subject: userId }).mutation(api.users.setDeleted, {});
      const deleted = await t.run(async (ctx) => await ctx.db.get(userId));
      expect(deleted?.status).toBe('deleted');
    });

    test('remove account revokes sessions and clears account verification', async () => {
      const t = convexTest(schema);
      const { userId, sessionId, refreshId, accountId } = await t.run(async (ctx) => {
        const id = await ctx.db.insert('users', { name: 'To Delete 2', email: 'd2@d.com' });
        const authId = await ctx.db.insert('authAccounts', {
          userId: id,
          provider: 'password',
          providerAccountId: 'd2@d.com',
          emailVerified: 'd2@d.com',
        });
        const session = await ctx.db.insert('authSessions', {
          userId: id,
          expirationTime: Date.now() + 60_000,
        });
        const refresh = await ctx.db.insert('authRefreshTokens', {
          sessionId: session,
          expirationTime: Date.now() + 60_000,
        });
        return { userId: id, sessionId: session, refreshId: refresh, accountId: authId };
      });

      await t.withIdentity({ subject: userId }).mutation(api.users.setDeleted, {});

      const account = await t.run(async (ctx) => await ctx.db.get(accountId));
      expect(account?.emailVerified).toBeUndefined();
      const session = await t.run(async (ctx) => await ctx.db.get(sessionId));
      expect(session).toBeNull();
      const refresh = await t.run(async (ctx) => await ctx.db.get(refreshId));
      expect(refresh).toBeNull();
    });

    test('remove account throws if unauthenticated', async () => {
      const t = convexTest(schema);
      await expect(t.mutation(api.users.setDeleted, {})).rejects.toThrow('Not authenticated');
    });

    test('generate and validate check-in token', async () => {
      const t = convexTest(schema);
      const organizerId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', { name: 'Organizer', email: 'org@t.com' });
      });
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', { name: 'QR User', email: 'qr@t.com' });
      });
      const eventId = await t.run(async (ctx) => {
        return await ctx.db.insert('events', {
          title: 'Event',
          description: '',
          location: '',
          startDate: 0,
          endDate: 0,
          categories: [],
          contactInfo: '',
          commission: 0,
          services: [],
          visibility: 'public',
          organizerId: organizerId,
        });
      });
      await t.run(async (ctx) => {
        await ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' });
      });

      const { token } = await t
        .withIdentity({ subject: userId })
        .mutation(api.users.generateCheckInToken, {});
      expect(token).toBeDefined();

      const userByToken = await t
        .withIdentity({ subject: organizerId })
        .query(api.users.getUserByCheckInToken, { token, eventId });
      expect(userByToken?._id).toBe(userId);

      // Invalid token
      const invalid = await t
        .withIdentity({ subject: organizerId })
        .query(api.users.getUserByCheckInToken, { token: 'invalid', eventId });
      expect(invalid).toBeNull();

      // Expired token
      await t.run(async (ctx) => {
        await ctx.db.patch(userId, { checkInTokenExpires: Date.now() - 1000 });
      });
      const expired = await t
        .withIdentity({ subject: organizerId })
        .query(api.users.getUserByCheckInToken, { token, eventId });
      expect(expired).toBeNull();
    });

    test('generateCheckInToken throws if unauthenticated', async () => {
      const t = convexTest(schema);
      await expect(t.mutation(api.users.generateCheckInToken, {})).rejects.toThrow(
        'Not authenticated'
      );
    });

    test('getExportData returns comprehensive info', async () => {
      const t = convexTest(schema);
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', { name: 'Export User', email: 'ex@t.com' });
      });

      const data = await t.withIdentity({ subject: userId }).query(api.users.getExportData, {});
      expect(data.profile.name).toBe('Export User');
      expect(data.products).toBeDefined();
      expect(data.organizedEvents).toBeDefined();

      // User record deleted but identity persists
      await t.run(async (ctx) => {
        await ctx.db.delete(userId);
      });
      await expect(
        t.withIdentity({ subject: userId }).query(api.users.getExportData, {})
      ).rejects.toThrow('User not found');
    });

    test('getExportData throws if unauthenticated', async () => {
      const t = convexTest(schema);
      await expect(t.query(api.users.getExportData, {})).rejects.toThrow('Not authenticated');
    });

    test('getUserProviders returns linked providers', async () => {
      const t = convexTest(schema);
      const userId = await t.run(async (ctx) => {
        const id = await ctx.db.insert('users', { name: 'Provider User' });
        await ctx.db.insert('authAccounts', {
          userId: id,
          provider: 'github',
          providerAccountId: 'gh-123',
        });
        return id;
      });

      const providers = await t
        .withIdentity({ subject: userId })
        .query(api.users.getUserProviders, {});
      expect(providers).toContain('github');
    });

    test('getUserProviders returns empty if unauthenticated', async () => {
      const t = convexTest(schema);
      const providers = await t.query(api.users.getUserProviders, {});
      expect(providers).toEqual([]);
    });

    describe('markOnboardingSeen', () => {
      test('throws if unauthenticated', async () => {
        const t = convexTest(schema);
        await expect(t.mutation(api.users.markOnboardingSeen, {})).rejects.toThrow(
          'Not authenticated'
        );
      });

      test('throws if user does not exist', async () => {
        const t = convexTest(schema);
        const userId = await t.run(async (ctx) => {
          const id = await ctx.db.insert('users', { name: 'Ghost User', email: 'ghost@t.com' });
          await ctx.db.delete(id);
          return id;
        });

        await expect(
          t.withIdentity({ subject: userId }).mutation(api.users.markOnboardingSeen, {})
        ).rejects.toThrow('User not found');
      });

      test('sets needsOnboarding=false when it is currently true', async () => {
        const t = convexTest(schema);
        const userId = await t.run(async (ctx) => {
          return await ctx.db.insert('users', { name: 'Onboarding User', needsOnboarding: true });
        });

        await t.withIdentity({ subject: userId }).mutation(api.users.markOnboardingSeen, {});

        const updated = await t.run(async (ctx) => await ctx.db.get(userId));
        expect(updated?.needsOnboarding).toBe(false);
      });

      test('does not change needsOnboarding when it is already false', async () => {
        const t = convexTest(schema);
        const userId = await t.run(async (ctx) => {
          return await ctx.db.insert('users', { name: 'No Onboarding', needsOnboarding: false });
        });

        await t.withIdentity({ subject: userId }).mutation(api.users.markOnboardingSeen, {});

        const updated = await t.run(async (ctx) => await ctx.db.get(userId));
        expect(updated?.needsOnboarding).toBe(false);
      });
    });

    test('update profile throws if authenticated user record does not exist', async () => {
      const t = convexTest(schema);
      const userId = await t.run(async (ctx) => {
        const id = await ctx.db.insert('users', { name: 'Ghost User', email: 'ghost@t.com' });
        await ctx.db.delete(id);
        return id;
      });

      await expect(
        t.withIdentity({ subject: userId }).mutation(api.users.update, { firstName: 'New' })
      ).rejects.toThrow('User not found');
    });

    test('changePassword throws if unauthenticated', async () => {
      const t = convexTest(schema);
      await expect(
        t.mutation(api.users.changePassword, {
          oldPassword: 'old-password',
          newPassword: 'new-password',
        })
      ).rejects.toThrow('Not authenticated');
    });

    test('changePassword throws if password account is missing', async () => {
      const t = convexTest(schema);
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', { name: 'No Password Account', email: 'nopa@t.com' });
      });

      await expect(
        t.withIdentity({ subject: userId }).mutation(api.users.changePassword, {
          oldPassword: 'old-password',
          newPassword: 'new-password',
        })
      ).rejects.toThrow('Password account not found');
    });

    test('changePassword throws if account secret is missing', async () => {
      const t = convexTest(schema);
      const userId = await t.run(async (ctx) => {
        const id = await ctx.db.insert('users', {
          name: 'Missing Secret',
          email: 'nosecret@t.com',
        });
        await ctx.db.insert('authAccounts', {
          userId: id,
          provider: 'password',
          providerAccountId: 'nosecret@t.com',
        });
        return id;
      });

      await expect(
        t.withIdentity({ subject: userId }).mutation(api.users.changePassword, {
          oldPassword: 'old-password',
          newPassword: 'new-password',
        })
      ).rejects.toThrow('Passwortkonto ist unvollständig konfiguriert.');
    });

    test('changePassword throws if old password is incorrect', { timeout: 20000 }, async () => {
      const t = convexTest(schema);
      const scrypt = new Scrypt();
      const oldSecret = await scrypt.hash('correct-old-password');

      const userId = await t.run(async (ctx) => {
        const id = await ctx.db.insert('users', { name: 'Wrong Old Password', email: 'wop@t.com' });
        await ctx.db.insert('authAccounts', {
          userId: id,
          provider: 'password',
          providerAccountId: 'wop@t.com',
          secret: oldSecret,
        });
        return id;
      });

      await expect(
        t.withIdentity({ subject: userId }).mutation(api.users.changePassword, {
          oldPassword: 'wrong-old-password',
          newPassword: 'new-password',
        })
      ).rejects.toThrow('Altes Passwort ist nicht korrekt');
    });

    test('changePassword updates secret if old password is valid', { timeout: 20000 }, async () => {
      const t = convexTest(schema);
      const scrypt = new Scrypt();
      const oldSecret = await scrypt.hash('correct-old-password');
      const newPassword = 'new-password';

      const { userId, accountId } = await t.run(async (ctx) => {
        const id = await ctx.db.insert('users', { name: 'Password Change', email: 'pc@t.com' });
        const authId = await ctx.db.insert('authAccounts', {
          userId: id,
          provider: 'password',
          providerAccountId: 'pc@t.com',
          secret: oldSecret,
        });
        return { userId: id, accountId: authId };
      });

      await t.withIdentity({ subject: userId }).mutation(api.users.changePassword, {
        oldPassword: 'correct-old-password',
        newPassword,
      });

      const updatedAccount = await t.run(async (ctx) => await ctx.db.get(accountId));
      expect(updatedAccount?.secret).toBeDefined();
      expect(updatedAccount?.secret).not.toBe(oldSecret);
      expect(await scrypt.verify(updatedAccount!.secret!, newPassword)).toBe(true);
    });

    test('getE2eVerificationCode throws if feature flag is disabled', async () => {
      const t = convexTest(schema);
      await t.run(async (ctx) => {
        await ctx.db.insert('featureFlags', {
          key: 'is_e2e_auth_skip_email',
          value: false,
          description: 'Disabled in test',
        });
      });

      await expect(
        t.query(api.users.getE2eVerificationCode, { email: 'e2e@test.com' })
      ).rejects.toThrow('E2E-Auth-Modus ist deaktiviert.');
    });

    test('getE2eVerificationCode throws if token does not exist', async () => {
      const t = convexTest(schema);
      await t.run(async (ctx) => {
        await ctx.db.insert('featureFlags', {
          key: 'is_e2e_auth_skip_email',
          value: true,
          description: 'Enabled in test',
        });
      });

      await expect(
        t.query(api.users.getE2eVerificationCode, { email: 'missing@test.com' })
      ).rejects.toThrow('Kein Verifizierungscode für diese E-Mail gefunden.');
    });

    test('setE2eVerificationCode creates and updates code when feature flag is enabled', async () => {
      const t = convexTest(schema);
      await t.run(async (ctx) => {
        await ctx.db.insert('featureFlags', {
          key: 'is_e2e_auth_skip_email',
          value: true,
          description: 'Enabled in test',
        });
      });

      await t.mutation(internal.users.setE2eVerificationCode, {
        email: 'token@test.com',
        code: 'ABC123',
      });
      await expect(
        t.query(api.users.getE2eVerificationCode, { email: 'token@test.com' })
      ).resolves.toBe('ABC123');

      await t.mutation(internal.users.setE2eVerificationCode, {
        email: 'token@test.com',
        code: 'XYZ789',
      });
      await expect(
        t.query(api.users.getE2eVerificationCode, { email: 'token@test.com' })
      ).resolves.toBe('XYZ789');
    });

    test('confirmEmailForE2E marks user and updates account', async () => {
      const t = convexTest(schema);
      const { userId, accountId } = await t.run(async (ctx) => {
        await ctx.db.insert('featureFlags', {
          key: 'is_e2e_auth_skip_email',
          value: true,
          description: 'Enabled in test',
        });
        const id = await ctx.db.insert('users', { name: 'E2E User', email: 'e2e@t.com' });
        const authId = await ctx.db.insert('authAccounts', {
          userId: id,
          provider: 'password',
          providerAccountId: 'e2e@t.com',
        });
        return { userId: id, accountId: authId };
      });

      const result = await t.mutation(api.users.confirmEmailForE2E, { email: 'e2e@t.com' });
      expect(result.ok).toBe(true);

      const user = await t.run(async (ctx) => await ctx.db.get(userId));
      expect(user?.isMailConfirmed).toBe(true);
      expect(user?.emailVerificationTime).toBeTypeOf('number');
      const account = await t.run(async (ctx) => await ctx.db.get(accountId));
      expect(account?.emailVerified).toBe('e2e@t.com');
    });

    test('confirmEmailForE2E succeeds without matching account', async () => {
      const t = convexTest(schema);
      const userId = await t.run(async (ctx) => {
        await ctx.db.insert('featureFlags', {
          key: 'is_e2e_auth_skip_email',
          value: true,
          description: 'Enabled in test',
        });
        return await ctx.db.insert('users', { name: 'E2E User 2', email: 'e2e2@t.com' });
      });

      const result = await t.mutation(api.users.confirmEmailForE2E, { email: 'e2e2@t.com' });
      expect(result.ok).toBe(true);

      const user = await t.run(async (ctx) => await ctx.db.get(userId));
      expect(user?.isMailConfirmed).toBe(true);
      expect(user?.emailVerificationTime).toBeTypeOf('number');
    });
  });

  describe('providers', () => {
    test('returns empty providers list when unauthenticated', async () => {
      const t = convexTest(schema);
      const providers = await t.query(api.users.getUserProviders);
      expect(providers).toEqual([]);
    });

    test('returns providers for authenticated user', async () => {
      const t = convexTest(schema);
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', { name: 'P', email: 'p@test.com' });
      });
      await t.run(async (ctx) => {
        await ctx.db.insert('authAccounts', {
          userId,
          provider: 'google',
          providerAccountId: 'google|p@test.com',
          emailVerified: 'p@test.com',
        });
        await ctx.db.insert('authAccounts', {
          userId,
          provider: 'github',
          providerAccountId: 'github|p@test.com',
          emailVerified: 'p@test.com',
        });
      });

      const providers = await t.withIdentity({ subject: userId }).query(api.users.getUserProviders);
      expect(providers.sort()).toEqual(['github', 'google']);
    });
  });

  describe('missing profile data', () => {
    test('returns missing fields when values are empty or whitespace', async () => {
      const t = convexTest(schema);
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', {
          name: 'M',
          email: 'm@test.com',
          firstName: ' ',
          lastName: '',
          phone: undefined,
          street: 'Street',
          city: '',
          zipCode: ' ',
          country: 'DE',
        });
      });

      const missing = await t.query(api.users.getMissinfProfileData, { userId });
      expect(missing).toContain('firstName');
      expect(missing).toContain('lastName');
      expect(missing).toContain('phone');
      expect(missing).toContain('city');
      expect(missing).toContain('zipCode');
      expect(missing).not.toContain('street');
      expect(missing).not.toContain('country');
    });
  });

  describe('getUserById', () => {
    test('returns user for organizer of event', async () => {
      const t = convexTest(schema);
      const organizerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Org' }));
      const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'User' }));
      const eventId = await t.run((ctx) =>
        ctx.db.insert('events', {
          title: 'Event',
          organizerId,
          commission: 10,
          description: '',
          location: '',
          startDate: 0,
          endDate: 0,
          categories: [],
          contactInfo: '',
          services: [],
          visibility: 'public',
        })
      );
      await t.run((ctx) =>
        ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' })
      );

      const result = await t
        .withIdentity({ subject: organizerId })
        .query(api.users.getUserById, { userId, eventId });
      expect(result?._id).toBe(userId);
    });

    test('throws if not organizer of specified event', async () => {
      const t = convexTest(schema);
      const otherId = await t.run((ctx) => ctx.db.insert('users', { name: 'Other' }));
      const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'User' }));
      const eventId = await t.run((ctx) =>
        ctx.db.insert('events', {
          title: 'Event',
          organizerId: userId,
          commission: 10,
          description: '',
          location: '',
          startDate: 0,
          endDate: 0,
          categories: [],
          contactInfo: '',
          services: [],
          visibility: 'public',
        })
      );

      await expect(
        t.withIdentity({ subject: otherId }).query(api.users.getUserById, { userId, eventId })
      ).rejects.toThrow('Not authorized');
    });

    test('throws if unauthenticated', async () => {
      const t = convexTest(schema);
      const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'User' }));
      await expect(t.query(api.users.getUserById, { userId })).rejects.toThrow('Not authenticated');
    });

    test('allows user to fetch own profile without event', async () => {
      const t = convexTest(schema);
      const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Self' }));
      const result = await t
        .withIdentity({ subject: userId })
        .query(api.users.getUserById, { userId });
      expect(result?._id).toBe(userId);
    });

    test('rejects fetching other user without event', async () => {
      const t = convexTest(schema);
      const userA = await t.run((ctx) => ctx.db.insert('users', { name: 'A' }));
      const userB = await t.run((ctx) => ctx.db.insert('users', { name: 'B' }));
      await expect(
        t.withIdentity({ subject: userA }).query(api.users.getUserById, { userId: userB })
      ).rejects.toThrow('Not authorized');
    });

    test('getUserByEmail returns user by email', async () => {
      const t = convexTest(schema);
      const email = 'find@me.com';
      await t.run((ctx) => ctx.db.insert('users', { name: 'Found', email }));
      const result = await t.query(api.users.getUserByEmail, { email });
      expect(result?.email).toBe(email);
    });

    test('setUserStatus updates user status', async () => {
      const t = convexTest(schema);
      const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Status User' }));
      await t.mutation(api.users.setUserStatus, { userId, status: 'active' });
      const updated = await t.run((ctx) => ctx.db.get(userId));
      expect(updated?.status).toBe('active');
    });

    test('setUserStatus throws if user not found', async () => {
      const t = convexTest(schema);
      const userId = await t.run(async (ctx) => {
        const id = await ctx.db.insert('users', { name: 'Ghost' });
        await ctx.db.delete(id);
        return id;
      });
      await expect(
        t.mutation(api.users.setUserStatus, { userId, status: 'active' })
      ).rejects.toThrow('User not found');
    });

    test('getMissinfProfileData throws if user not found', async () => {
      const t = convexTest(schema);
      const userId = await t.run(async (ctx) => {
        const id = await ctx.db.insert('users', { name: 'Ghost' });
        await ctx.db.delete(id);
        return id;
      });
      await expect(t.query(api.users.getMissinfProfileData, { userId })).rejects.toThrow(
        'User not found'
      );
    });

    test('setDeleted removes sessions and tokens', async () => {
      const t = convexTest(schema);
      const userId = await t.run(async (ctx) => {
        const id = await ctx.db.insert('users', { name: 'Delete Me', email: 'del@t.com' });
        await ctx.db.insert('authAccounts', {
          userId: id,
          provider: 'password',
          providerAccountId: 'del@t.com',
        });
        const sessionId = await ctx.db.insert('authSessions', {
          userId: id,
          expirationTime: Date.now() + 1000,
        });
        await ctx.db.insert('authRefreshTokens', { sessionId, expirationTime: Date.now() + 1000 });
        return id;
      });

      await t.withIdentity({ subject: userId }).mutation(api.users.setDeleted, {});

      await t.run(async (ctx) => {
        const sessions = await ctx.db
          .query('authSessions')
          .withIndex('userId', (q) => q.eq('userId', userId))
          .collect();
        expect(sessions.length).toBe(0);
        const tokens = await ctx.db.query('authRefreshTokens').collect();
        expect(tokens.length).toBe(0);
        const user = await ctx.db.get(userId);
        expect(user?.status).toBe('deleted');
      });
    });

    test('confirmEmailForE2E updates user and account', async () => {
      const t = convexTest(schema);
      const email = 'e2e@test.com';
      await t.run(async (ctx) => {
        await ctx.db.insert('featureFlags', { key: 'is_e2e_auth_skip_email', value: true });
        const userId = await ctx.db.insert('users', { email, name: 'E2E' });
        await ctx.db.insert('authAccounts', {
          userId,
          provider: 'password',
          providerAccountId: email,
        });
      });

      await t.mutation(api.users.confirmEmailForE2E, { email });

      const user = await t.run(
        async (ctx) =>
          await ctx.db
            .query('users')
            .withIndex('by_email', (q) => q.eq('email', email))
            .unique()
      );
      expect(user?.isMailConfirmed).toBe(true);
    });

    test('confirmEmailForE2E throws if feature flag disabled', async () => {
      const t = convexTest(schema);
      await t.run(async (ctx) => {
        await ctx.db.insert('featureFlags', { key: 'is_e2e_auth_skip_email', value: false });
      });
      await expect(
        t.mutation(api.users.confirmEmailForE2E, { email: 'any@t.com' })
      ).rejects.toThrow('E2E-Auth-Modus ist deaktiviert.');
    });

    test('confirmEmailForE2E throws if user not found', async () => {
      const t = convexTest(schema);
      await t.run(async (ctx) => {
        await ctx.db.insert('featureFlags', { key: 'is_e2e_auth_skip_email', value: true });
      });
      await expect(
        t.mutation(api.users.confirmEmailForE2E, { email: 'none@t.com' })
      ).rejects.toThrow('Kein Benutzer mit der E-Mail none@t.com gefunden.');
    });

    test('setProfileForE2E updates profile fields', async () => {
      const t = convexTest(schema);
      const email = 'profile@e2e.com';
      await t.run(async (ctx) => {
        await ctx.db.insert('featureFlags', { key: 'is_e2e_auth_skip_email', value: true });
        await ctx.db.insert('users', { email, name: 'Initial' });
      });

      await t.mutation(api.users.setProfileForE2E, { email, firstName: 'John', lastName: 'Doe' });

      const user = await t.run(
        async (ctx) =>
          await ctx.db
            .query('users')
            .withIndex('by_email', (q) => q.eq('email', email))
            .unique()
      );
      expect(user?.firstName).toBe('John');
      expect(user?.lastName).toBe('Doe');
      expect(user?.city).toBe('Musterstadt'); // default value
    });

    test('setProfileForE2E throws if flag disabled', async () => {
      const t = convexTest(schema);
      await t.run(async (ctx) => {
        await ctx.db.insert('featureFlags', { key: 'is_e2e_auth_skip_email', value: false });
      });
      await expect(t.mutation(api.users.setProfileForE2E, { email: 'any@t.com' })).rejects.toThrow(
        'E2E-Auth-Modus ist deaktiviert.'
      );
    });

    test('setProfileForE2E throws if user not found', async () => {
      const t = convexTest(schema);
      await t.run(async (ctx) => {
        await ctx.db.insert('featureFlags', { key: 'is_e2e_auth_skip_email', value: true });
      });
      await expect(t.mutation(api.users.setProfileForE2E, { email: 'none@t.com' })).rejects.toThrow(
        'Kein Benutzer mit der E-Mail none@t.com gefunden.'
      );
    });

    test('getUserByCheckInToken throws if viewer not authorized', async () => {
      const t = convexTest(schema);
      const otherId = await t.run((ctx) => ctx.db.insert('users', { name: 'Other' }));
      const eventId = await t.run((ctx) =>
        ctx.db.insert('events', {
          title: 'E',
          organizerId: otherId,
          commission: 0,
          description: '',
          location: '',
          startDate: 0,
          endDate: 0,
          categories: [],
          contactInfo: '',
          services: [],
          visibility: 'public',
        })
      );

      await expect(
        t
          .withIdentity({ subject: otherId })
          .query(api.users.getUserByCheckInToken, { token: 'tok', eventId })
      ).rejects.toThrow('Not authorized');
    });
  });

  describe('getUserByEmail', () => {
    test('returns user by email', async () => {
      const t = convexTest(schema);
      const userId = await t.run((ctx) =>
        ctx.db.insert('users', { name: 'Lookup', email: 'lookup@test.com' })
      );

      const result = await t.query(api.users.getUserByEmail, { email: 'lookup@test.com' });
      expect(result?._id).toBe(userId);
    });
  });

  describe('update', () => {
    test('updates name when first or last name changes', async () => {
      const t = convexTest(schema);
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', {
          name: 'John Doe',
          firstName: 'John',
          lastName: 'Doe',
          email: 'update@test.com',
        });
      });

      await t.withIdentity({ subject: userId }).mutation(api.users.update, {
        firstName: 'Jane',
      });

      const user = await t.run(async (ctx) => ctx.db.get(userId));
      expect(user?.firstName).toBe('Jane');
      expect(user?.lastName).toBe('Doe');
      expect(user?.name).toBe('Jane Doe');
    });
  });

  describe('getMissinfProfileData', () => {
    test('returns missing required fields', async () => {
      const t = convexTest(schema);
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', {
          email: 'missing@test.com',
          firstName: 'A',
        });
      });

      const missing = await t.query(api.users.getMissinfProfileData, { userId });
      expect(missing).toContain('lastName');
      expect(missing).toContain('phone');
      expect(missing).toContain('street');
    });

    test('returns empty when profile is complete', async () => {
      const t = convexTest(schema);
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', {
          email: 'complete@test.com',
          firstName: 'A',
          lastName: 'B',
          phone: '123',
          street: 'Street',
          city: 'City',
          zipCode: '12345',
          country: 'DE',
        });
      });

      const missing = await t.query(api.users.getMissinfProfileData, { userId });
      expect(missing).toHaveLength(0);
    });
  });

  describe('admin actions', () => {
    test('listUsersForAdmin returns users for admin', async () => {
      const t = convexTest(schema);
      const adminId = await t.run((ctx) =>
        ctx.db.insert('users', { name: 'Admin', email: 'admin@test.com', systemRole: 'admin' })
      );
      const userId = await t.run((ctx) =>
        ctx.db.insert('users', { name: 'User', email: 'user@test.com', status: 'active' })
      );

      const users = await t.withIdentity({ subject: adminId }).query(api.users.listUsersForAdmin);
      expect(users).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ _id: adminId }),
          expect.objectContaining({ _id: userId }),
        ])
      );
    });

    test('listUsersForAdmin throws for non-admin', async () => {
      const t = convexTest(schema);
      const userId = await t.run((ctx) =>
        ctx.db.insert('users', { name: 'Not Admin', email: 'na@test.com', systemRole: 'user' })
      );

      await expect(
        t.withIdentity({ subject: userId }).query(api.users.listUsersForAdmin)
      ).rejects.toThrow('Not authorized');
    });

    test('setUserStatusForAdmin prevents self-ban', async () => {
      const t = convexTest(schema);
      const adminId = await t.run((ctx) =>
        ctx.db.insert('users', { name: 'Admin2', email: 'admin2@test.com', systemRole: 'admin' })
      );

      await expect(
        t.withIdentity({ subject: adminId }).mutation(api.users.setUserStatusForAdmin, {
          userId: adminId,
          status: 'banned',
        })
      ).rejects.toThrow('Cannot ban yourself');
    });

    test('setUserStatusForAdmin bans user and revokes sessions', async () => {
      const t = convexTest(schema);
      const adminId = await t.run((ctx) =>
        ctx.db.insert('users', { name: 'Admin3', email: 'admin3@test.com', systemRole: 'admin' })
      );
      const { userId, sessionId, refreshId } = await t.run(async (ctx) => {
        const id = await ctx.db.insert('users', { name: 'Ban Me', email: 'ban@test.com' });
        const session = await ctx.db.insert('authSessions', {
          userId: id,
          expirationTime: Date.now() + 60_000,
        });
        const refresh = await ctx.db.insert('authRefreshTokens', {
          sessionId: session,
          expirationTime: Date.now() + 60_000,
        });
        return { userId: id, sessionId: session, refreshId: refresh };
      });

      const result = await t
        .withIdentity({ subject: adminId })
        .mutation(api.users.setUserStatusForAdmin, {
          userId,
          status: 'banned',
        });
      expect(result.ok).toBe(true);

      const updated = await t.run(async (ctx) => await ctx.db.get(userId));
      expect(updated?.status).toBe('banned');
      const session = await t.run(async (ctx) => await ctx.db.get(sessionId));
      expect(session).toBeNull();
      const refresh = await t.run(async (ctx) => await ctx.db.get(refreshId));
      expect(refresh).toBeNull();
    });
  });

  describe('status helpers', () => {
    test('setUserStatus updates status', async () => {
      const t = convexTest(schema);
      const userId = await t.run((ctx) =>
        ctx.db.insert('users', { name: 'Status User', email: 'status@test.com' })
      );

      await t.mutation(api.users.setUserStatus, { userId, status: 'inactive' });
      const user = await t.run(async (ctx) => await ctx.db.get(userId));
      expect(user?.status).toBe('inactive');
    });

    test('setUserStatus throws if user missing', async () => {
      const t = convexTest(schema);
      const userId = await t.run(async (ctx) => {
        const id = await ctx.db.insert('users', { name: 'Temp', email: 'temp2@test.com' });
        await ctx.db.delete(id);
        return id;
      });

      await expect(
        t.mutation(api.users.setUserStatus, { userId, status: 'inactive' })
      ).rejects.toThrow('User not found');
    });

    test('getUserStatusInternal returns status', async () => {
      const t = convexTest(schema);
      const userId = await t.run((ctx) =>
        ctx.db.insert('users', { name: 'Internal', email: 'internal@test.com', status: 'active' })
      );

      const status = await t.query(internal.users.getUserStatusInternal, { userId });
      expect(status).toBe('active');
    });
  });
});
