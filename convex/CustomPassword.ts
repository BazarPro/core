import {
  ConvexCredentials,
  type ConvexCredentialsUserConfig,
} from '@convex-dev/auth/providers/ConvexCredentials';
import {
  createAccount,
  invalidateSessions,
  modifyAccountCredentials,
  retrieveAccount,
  signInViaProvider,
  type EmailConfig,
  type GenericActionCtxWithAuthConfig,
  type GenericDoc,
} from '@convex-dev/auth/server';
import { internal } from './_generated/api';
import type { DocumentByName, GenericDataModel, WithoutSystemFields } from 'convex/server';
import { Scrypt } from 'lucia';
import type { Id } from './_generated/dataModel';
import type { Value } from 'convex/values';

/**
 * Password provider with user status checks.
 * Blocks sign-in/reset/verification when user is banned or deleted.
 */
export interface PasswordConfig<DataModel extends GenericDataModel> {
  id?: string;
  profile?: (
    params: Record<string, Value | undefined>,
    ctx: GenericActionCtxWithAuthConfig<DataModel>
  ) => WithoutSystemFields<DocumentByName<DataModel, 'users'>> & {
    email: string;
  };
  validatePasswordRequirements?: (password: string) => void;
  crypto?: ConvexCredentialsUserConfig['crypto'];
  reset?: EmailConfig | ((...args: unknown[]) => EmailConfig);
  verify?: EmailConfig | ((...args: unknown[]) => EmailConfig);
}

export function CustomPassword<DataModel extends GenericDataModel>(
  config: PasswordConfig<DataModel> = {}
) {
  const provider = config.id ?? 'password';
  return ConvexCredentials<DataModel>({
    id: 'password',
    authorize: async (params, ctx) => {
      type UserProfile = WithoutSystemFields<DocumentByName<DataModel, 'users'>> & {
        email: string;
      };

      const flow = params.flow as string;
      const passwordToValidate =
        flow === 'signUp'
          ? (params.password as string)
          : flow === 'reset-verification'
            ? (params.newPassword as string)
            : null;
      if (passwordToValidate !== null) {
        if (config.validatePasswordRequirements !== undefined) {
          config.validatePasswordRequirements(passwordToValidate);
        } else {
          validateDefaultPasswordRequirements(passwordToValidate);
        }
      }

      const profile = (config.profile?.(params, ctx) ?? defaultProfile(params)) as UserProfile;
      const { email } = profile;
      const secret = params.password as string;

      const assertUserActive = async (userId: Id<'users'>) => {
        const status = await ctx.runQuery(internal.users.getUserStatusInternal, {
          userId,
        });
        if (status === 'deleted') {
          throw new Error('ACCOUNT_DELETED');
        }
        if (status === 'banned') {
          throw new Error('ACCOUNT_BANNED');
        }
      };

      let account: GenericDoc<DataModel, 'authAccounts'>;
      let user: GenericDoc<DataModel, 'users'>;
      if (flow === 'signUp') {
        if (secret === undefined) {
          throw new Error('Missing `password` param for `signUp` flow');
        }
        const created = await createAccount(ctx, {
          provider,
          account: { id: email, secret },
          profile,
          shouldLinkViaEmail: config.verify !== undefined,
          shouldLinkViaPhone: false,
        });
        ({ account, user } = created);
      } else if (flow === 'signIn') {
        if (secret === undefined) {
          throw new Error('Missing `password` param for `signIn` flow');
        }
        const retrieved = await retrieveAccount(ctx, {
          provider,
          account: { id: email, secret },
        });
        if (retrieved === null) {
          throw new Error('Invalid credentials');
        }
        ({ account, user } = retrieved);
        await assertUserActive(user._id as Id<'users'>);
      } else if (flow === 'reset') {
        if (!config.reset) {
          throw new Error(`Password reset is not enabled for ${provider}`);
        }
        const { account } = await retrieveAccount(ctx, {
          provider,
          account: { id: email },
        });
        await assertUserActive(account.userId as Id<'users'>);
        return await signInViaProvider(ctx, config.reset, {
          accountId: account._id,
          params,
        });
      } else if (flow === 'reset-verification') {
        if (!config.reset) {
          throw new Error(`Password reset is not enabled for ${provider}`);
        }
        if (params.newPassword === undefined) {
          throw new Error('Missing `newPassword` param for `reset-verification` flow');
        }
        const result = await signInViaProvider(ctx, config.reset, { params });
        if (result === null) {
          throw new Error('Invalid code');
        }
        await assertUserActive(result.userId as Id<'users'>);
        const { userId, sessionId } = result;
        const secret = params.newPassword as string;
        await modifyAccountCredentials(ctx, {
          provider,
          account: { id: email, secret },
        });
        await invalidateSessions(ctx, { userId, except: [sessionId] });
        return { userId, sessionId };
      } else if (flow === 'email-verification') {
        if (!config.verify) {
          throw new Error(`Email verification is not enabled for ${provider}`);
        }
        const { account } = await retrieveAccount(ctx, {
          provider,
          account: { id: email },
        });
        await assertUserActive(account.userId as Id<'users'>);
        return await signInViaProvider(ctx, config.verify, {
          accountId: account._id,
          params,
        });
      } else {
        throw new Error(
          'Missing `flow` param, it must be one of ' +
            '"signUp", "signIn", "reset", "reset-verification" or ' +
            '"email-verification"!'
        );
      }

      if (config.verify && !account.emailVerified) {
        return await signInViaProvider(ctx, config.verify, {
          accountId: account._id,
          params,
        });
      }
      return { userId: user._id };
    },
    crypto: {
      async hashSecret(password: string) {
        return await new Scrypt().hash(password);
      },
      async verifySecret(password: string, hash: string) {
        return await new Scrypt().verify(hash, password);
      },
    },
    extraProviders: [config.reset, config.verify],
    ...config,
  });
}

function validateDefaultPasswordRequirements(password: string) {
  if (!password || password.length < 8) {
    throw new Error('Invalid password');
  }
}

function defaultProfile(params: Record<string, unknown>) {
  return {
    email: params.email as string,
  };
}
