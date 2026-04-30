import Google from '@auth/core/providers/google';
import GitHub from '@auth/core/providers/github';
import { convexAuth } from '@convex-dev/auth/server';
import type { MutationCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { DataModel } from './_generated/dataModel';
import { SmtpOTP } from './SmtpOTP';
import { CustomPassword } from './CustomPassword';

/**
 * Normalize password provider profile data into Convex user metadata.
 *
 * @param params - Profile params from @convex-dev/auth providers.
 * @returns Object containing required user fields for account creation/lookup.
 */
const PasswordProvider = CustomPassword<DataModel>({
  verify: SmtpOTP,
  reset: SmtpOTP,
  profile(params) {
    return {
      email: params.email as string,
      name: params.name as string,
    };
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google, GitHub, PasswordProvider],
  callbacks: {
    async createOrUpdateUser(ctx: MutationCtx, args) {
      const throwIfBannedOrDeleted = (user: { status?: string }) => {
        if (user.status === 'deleted') {
          throw new Error('ACCOUNT_DELETED');
        }
        if (user.status === 'banned') {
          throw new Error('ACCOUNT_BANNED');
        }
      };

      const getFlag = async (key: string) => {
        const flag = await ctx.db
          .query('featureFlags')
          .withIndex('by_key', (q) => q.eq('key', key))
          .unique();
        return flag?.value ?? true;
      };

      const isLoginEnabled = await getFlag('is_login_enabled');
      const isRegistrationEnabled = await getFlag('is_registration_enabled');
      const isCreateProductsEnabled = await getFlag('is_create_products_on_signup_enabled');

      if (!isLoginEnabled) {
        throw new Error('Login is currently disabled.');
      }
      if (args.existingUserId) {
        const existingById = await ctx.db.get(args.existingUserId);
        if (existingById) {
          throwIfBannedOrDeleted(existingById);
        }
      }
      const email = args.profile.email as string | undefined;
      console.log('New Login with mail:', email);
      const isEmailVerified = args.type === 'verification' || Boolean(args.profile.emailVerified);

      if (email) {
        console.log('New Login with mail:', email);
        const existingUser = await ctx.db
          .query('users')
          .withIndex('by_email', (q) => q.eq('email', email))
          .unique();

        if (existingUser) {
          throwIfBannedOrDeleted(existingUser);
        }

        if (existingUser) {
          if (args.type === 'verification' || args.profile.emailVerified) {
            await ctx.db.patch(existingUser._id, {
              isMailConfirmed: true,
              emailVerificationTime: Date.now(),
            });
          }
          return existingUser._id;
        }
      }

      // If we don't have an email, we can't link or check existence reliably for a new account
      // For GitHub, email is usually present. For Password, it should be too.
      // If no email, we assume it's a new user creation attempt.

      const existingUser = email
        ? await ctx.db
            .query('users')
            .withIndex('by_email', (q) => q.eq('email', email))
            .unique()
        : null;

      if (!isRegistrationEnabled && !existingUser) {
        throw new Error('Registration is currently disabled.');
      }

      if (existingUser) {
        if (args.type === 'credentials') {
          throw new Error('ACCOUNT_ALREADY_EXISTS');
        }
        if (isEmailVerified) {
          await ctx.db.patch(existingUser._id, {
            isMailConfirmed: true,
            emailVerificationTime: Date.now(),
          });
        }
        return existingUser._id;
      }

      // Create new user
      const userId = await ctx.db.insert('users', {
        name: args.profile.name as string | undefined,
        email: email,
        image: args.profile.image as string | undefined,
        // Set default roles/status if needed
        status: 'active',
        systemRole: 'user',
        isMailConfirmed: isEmailVerified,
        emailVerificationTime: isEmailVerified ? Date.now() : undefined,
        // New users should see the onboarding wizard
        needsOnboarding: true,
      });

      // If feature flag is enabled, create starter products for the new user
      if (isCreateProductsEnabled) {
        await ctx.scheduler.runAfter(0, internal.seed.createStarterProducts, { userId });
      }

      return userId;
    },
  },
});
