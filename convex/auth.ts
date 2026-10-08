import Google from '@auth/core/providers/google';
import GitHub from '@auth/core/providers/github';
import { convexAuth } from '@convex-dev/auth/server';
import type { MutationCtx } from './_generated/server';
import type { DataModel } from './_generated/dataModel';
import { SmtpOTP } from './SmtpOTP';
import { CustomPassword } from './CustomPassword';
import { createOrUpdateUser } from './authUsers';

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
  providers: [
    Google,
    // GitHub sends `iss` with the OAuth callback (RFC 9207). Without a configured
    // issuer, @convex-dev/auth compares it against a placeholder and rejects the
    // login with 'unexpected "iss" (issuer) response parameter value'.
    GitHub({ issuer: 'https://github.com/login/oauth' }),
    PasswordProvider,
  ],
  callbacks: {
    createOrUpdateUser: (ctx, args) => createOrUpdateUser(ctx as MutationCtx, args),
  },
});
