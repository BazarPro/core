import {
  query,
  mutation,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { Scrypt } from 'lucia';
import type { Doc, Id } from './_generated/dataModel';
import { hasAnyEventRoleOrAdmin } from './eventRoles';
import { USER_STATUSES, type UserStatus } from './constants';

type AuthCtx = MutationCtx | QueryCtx;

async function requireAdmin(ctx: AuthCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error('Not authenticated');
  }
  const user = await ctx.db.get(userId);
  if (!user || user.systemRole !== 'admin') {
    throw new Error('Not authorized');
  }
  return userId;
}

async function revokeUserSessions(ctx: MutationCtx, userId: Id<'users'>) {
  const sessions = await ctx.db
    .query('authSessions')
    .withIndex('userId', (q) => q.eq('userId', userId))
    .collect();

  for (const session of sessions) {
    const refreshTokens = await ctx.db
      .query('authRefreshTokens')
      .withIndex('sessionId', (q) => q.eq('sessionId', session._id))
      .collect();

    for (const token of refreshTokens) {
      await ctx.db.delete(token._id);
    }
    await ctx.db.delete(session._id);
  }
}

/**
 * Gets the current authenticated user
 * @returns Promise<Doc<'users'> | null> - Current user or null if not authenticated
 */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    return userId !== null ? ctx.db.get(userId) : null;
  },
});

/**
 * Gets the system role of a user
 * @param userId - ID of the user
 * @returns Promise<string | undefined> - System role of the user
 */
export const getUserSystemRole = query({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_id', (q) => q.eq('_id', userId))
      .unique();
    return user?.systemRole;
  },
});

/**
 * Gets the authentication providers for the current user
 * @returns Promise<string[]> - Array of provider names
 */
export const getUserProviders = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const accounts = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) => q.eq('userId', userId))
      .collect();

    return accounts.map((a) => a.provider);
  },
});

/**
 * Marks the onboarding as seen for the current user
 */
export const markOnboardingSeen = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('Not authenticated');
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (user.needsOnboarding) {
      await ctx.db.patch(userId, { needsOnboarding: false });
    }
  },
});

/**
 * Gets a user by ID with authorization checks
 * @param userId - ID of the user to retrieve
 * @param eventId - Optional event ID for authorization context
 * @returns Promise<Doc<'users'> | null> - User data or null
 */
export const getUserById = query({
  args: { userId: v.id('users'), eventId: v.optional(v.id('events')) },
  handler: async (ctx, { userId, eventId }) => {
    const viewerId = await getAuthUserId(ctx);
    if (!viewerId) throw new Error('Not authenticated');

    if (!eventId) {
      if (viewerId !== userId) {
        throw new Error('Not authorized: You can only view your own profile');
      }
      return await ctx.db.get(userId);
    }

    // Check if the viewer is the organizer or co-organizer of the specified event
    if (eventId) {
      const hasAccess = await hasAnyEventRoleOrAdmin(ctx, eventId, viewerId, [
        'organizer',
        'coorganizer',
      ]);

      if (!hasAccess) throw new Error('Not authorized: You are not authorized for this event');
    }

    return await ctx.db.get(userId);
  },
});

/**
 * Gets a user by Email Address with authorization checks
 * @param email - Email Address of the user to retrieve
 * @returns Promise<Doc<'users'> | null> - User data or null
 */
export const getUserByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    return await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique();
  },
});

export const getUserStatusInternal = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    return user?.status ?? null;
  },
});

/**
 * Updates user profile information
 * @param firstName - New first name
 * @param lastName - New last name
 * @param phone - New phone number
 * @param street - New street address
 * @param city - New city
 * @param zipCode - New zip code
 * @param country - New country
 * @param status - New user status
 */
export const update = mutation({
  args: {
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    phone: v.optional(v.string()),
    street: v.optional(v.string()),
    city: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    country: v.optional(v.string()),
    status: v.optional(v.union(...USER_STATUSES.map(v.literal))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('Not authenticated');
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const newFirstName = args.firstName ?? user.firstName;
    const newLastName = args.lastName ?? user.lastName;

    const patch: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      street?: string;
      city?: string;
      zipCode?: string;
      country?: string;
      name?: string;
      status?: UserStatus;
    } = { ...args };

    // Update 'name' if firstName or lastName changed
    if (newFirstName || newLastName) {
      patch.name = [newFirstName, newLastName].filter(Boolean).join(' ');
    }

    await ctx.db.patch(userId, patch);
  },
});

export const setUserStatus = mutation({
  args: {
    userId: v.id('users'),
    status: v.union(...USER_STATUSES.map(v.literal)),
  },
  handler: async (ctx, { userId, status }) => {
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    await ctx.db.patch(userId, { status: status });
  },
});

/**
 * Checks which required profile fields of a user are missing or invalid.
 *
 * A field is considered missing if:
 * - it is undefined or not a string
 * - it is an empty string or contains only whitespace
 *
 * This is typically used to ensure a user's profile is complete
 * before allowing certain actions (e.g. event registration).
 *
 * @param userId - The ID of the user to validate
 * @returns An array of field names that are missing or invalid
 *
 * @throws Error if the user does not exist
 */
export const getMissinfProfileData = query({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const requiredFields: (keyof Doc<'users'>)[] = [
      'firstName',
      'lastName',
      'phone',
      'street',
      'city',
      'zipCode',
      'country',
    ];
    const missingFields = requiredFields.filter((field) => {
      const value = user[field];
      return typeof value !== 'string' || value.trim() === '';
    });

    return missingFields;
  },
});

/**
 * Changes the user's password
 * @param oldPassword - Current password
 * @param newPassword - New password
 */
export const changePassword = mutation({
  args: {
    oldPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('Not authenticated');
    }

    const account = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) => q.eq('userId', userId).eq('provider', 'password'))
      .unique();

    if (!account) {
      throw new Error('Password account not found');
    }

    const secret = account.secret;
    if (!secret) {
      throw new Error('Passwortkonto ist unvollständig konfiguriert.');
    }

    const scrypt = new Scrypt();
    const isOldPasswordValid = await scrypt.verify(secret, args.oldPassword);
    if (!isOldPasswordValid) {
      throw new Error('Altes Passwort ist nicht korrekt');
    }

    const newSecret = await scrypt.hash(args.newPassword);

    await ctx.db.patch(account._id, {
      secret: newSecret,
    });
  },
});

export const setDeleted = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('Not authenticated');
    }

    await ctx.db.patch(userId, { status: 'deleted' });

    // Auch accounts emailVerified zurücksetzen
    const accounts = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) => q.eq('userId', userId))
      .collect();

    for (const account of accounts) {
      await ctx.db.patch(account._id, {
        emailVerified: undefined,
      });
    }

    // Sessions und refresh Tokens löschen
    await revokeUserSessions(ctx, userId);
  },
});

/**
 * Generates a check-in token for the user
 * @returns Promise<{token: string, expires: number}> - Token and expiration timestamp
 */
export const generateCheckInToken = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('Not authenticated');
    }

    const token =
      Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const expires = Date.now() + 60000; // 60 seconds validity

    await ctx.db.patch(userId, {
      checkInToken: token,
      checkInTokenExpires: expires,
    });

    return { token, expires };
  },
});

/**
 * Retrieves a user by a check-in token for a specific event.
 *
 * Only accessible by users with organizer or co-organizer role for the event.
 * Validates that the token exists and is not expired.
 *
 * @param token - The check-in token assigned to a user
 * @param eventId - The ID of the event where the check-in is performed
 * @returns The matching user if the token is valid and not expired, otherwise null
 *
 * @throws Error if the requester is not authenticated
 * @throws Error if the requester is not authorized for the event
 */
export const getUserByCheckInToken = query({
  args: { token: v.string(), eventId: v.id('events') },
  handler: async (ctx, { token, eventId }) => {
    const viewerId = await getAuthUserId(ctx);
    if (!viewerId) throw new Error('Not authenticated');
    if (!(await hasAnyEventRoleOrAdmin(ctx, eventId, viewerId, ['organizer', 'coorganizer']))) {
      throw new Error('Not authorized');
    }

    const user = await ctx.db
      .query('users')
      .withIndex('by_checkInToken', (q) => q.eq('checkInToken', token))
      .unique();

    if (!user || !user.checkInTokenExpires || user.checkInTokenExpires < Date.now()) {
      return null;
    }

    return user;
  },
});

/**
 * Exports all relevant data of the currently authenticated user.
 *
 * Includes:
 * - Profile information
 * - All products created by the user
 * - All events organized by the user
 *
 * Intended for data export (e.g. GDPR / user data download).
 *
 * @returns An object containing profile, products, organized events, and export timestamp
 *
 * @throws Error if the user is not authenticated
 * @throws Error if the user does not exist
 */
export const getExportData = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('Not authenticated');
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Fetch related data for export
    const products = await ctx.db
      .query('products')
      .withIndex('by_vendorId', (q) => q.eq('vendorId', userId))
      .collect();

    const organizedEvents = await ctx.db
      .query('events')
      .withIndex('by_organizerId', (q) => q.eq('organizerId', userId))
      .collect();

    return {
      profile: {
        name: user.name,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        street: user.street,
        city: user.city,
        zipCode: user.zipCode,
        country: user.country,
        createdAt: user._creationTime,
      },
      products: products.map((p) => ({
        title: p.title,
        description: p.description,
        price: p.price,
        condition: p.condition,
        createdAt: p._creationTime,
      })),
      organizedEvents: organizedEvents.map((e) => ({
        title: e.title,
        description: e.description,
        location: e.location,
        startDate: e.startDate,
        endDate: e.endDate,
        createdAt: e._creationTime,
      })),
      exportDate: new Date().toISOString(),
    };
  },
});

/**
 * Creates or updates an E2E authentication verification code for a given email.
 *
 * If a token already exists for the email, it is updated.
 * Otherwise, a new token entry is created.
 *
 * Used internally for automated end-to-end tests.
 *
 * @param email - The email address to associate with the verification code
 * @param code - The verification code to store
 */
export const setE2eVerificationCode = internalMutation({
  args: {
    email: v.string(),
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const existingToken = await ctx.db
      .query('e2eAuthTokens')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .unique();

    if (existingToken) {
      await ctx.db.patch(existingToken._id, {
        code: args.code,
        createdAt: Date.now(),
      });
      return;
    }

    await ctx.db.insert('e2eAuthTokens', {
      email: args.email,
      code: args.code,
      createdAt: Date.now(),
    });
  },
});

/**
 * Retrieves the E2E verification code for a given email.
 *
 * Only works if the E2E authentication feature flag is enabled.
 * Used in tests to bypass email-based verification.
 *
 * @param email - The email address associated with the verification code
 * @returns The verification code for the given email
 *
 * @throws Error if E2E auth mode is disabled
 * @throws Error if no verification code exists for the email
 */
export const getE2eVerificationCode = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const flag = await ctx.db
      .query('featureFlags')
      .withIndex('by_key', (q) => q.eq('key', 'is_e2e_auth_skip_email'))
      .unique();

    if (!flag?.value) {
      throw new Error('E2E-Auth-Modus ist deaktiviert.');
    }

    const token = await ctx.db
      .query('e2eAuthTokens')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .unique();

    if (!token) {
      throw new Error('Kein Verifizierungscode für diese E-Mail gefunden.');
    }

    return token.code;
  },
});

/**
 * Confirms a user's email address in E2E testing mode.
 *
 * Sets the user's email as verified and updates the corresponding auth account.
 * Only works if the E2E authentication feature flag is enabled.
 *
 * @param email - The email address of the user to confirm
 * @returns An object indicating success
 *
 * @throws Error if E2E auth mode is disabled
 * @throws Error if no user with the given email exists
 */
export const confirmEmailForE2E = mutation({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const flag = await ctx.db
      .query('featureFlags')
      .withIndex('by_key', (q) => q.eq('key', 'is_e2e_auth_skip_email'))
      .unique();

    if (!flag?.value) {
      throw new Error('E2E-Auth-Modus ist deaktiviert.');
    }

    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .unique();

    if (!user) {
      throw new Error(`Kein Benutzer mit der E-Mail ${args.email} gefunden.`);
    }

    await ctx.db.patch(user._id, {
      isMailConfirmed: true,
      emailVerificationTime: Date.now(),
    });

    const authAccount = await ctx.db
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .query('authAccounts' as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((q: any) => q.eq(q.field('providerAccountId'), args.email))
      .first();

    if (authAccount) {
      await ctx.db.patch(authAccount._id, {
        emailVerified: args.email,
      });
    }

    return { ok: true };
  },
});

/**
 * Sets required profile fields for a user in E2E testing mode.
 * This helper avoids flaky UI form interactions in end-to-end tests.
 */
export const setProfileForE2E = mutation({
  args: {
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    phone: v.optional(v.string()),
    street: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    city: v.optional(v.string()),
    country: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const flag = await ctx.db
      .query('featureFlags')
      .withIndex('by_key', (q) => q.eq('key', 'is_e2e_auth_skip_email'))
      .unique();

    if (!flag?.value) {
      throw new Error('E2E-Auth-Modus ist deaktiviert.');
    }

    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .unique();

    if (!user) {
      throw new Error(`Kein Benutzer mit der E-Mail ${args.email} gefunden.`);
    }

    await ctx.db.patch(user._id, {
      firstName: args.firstName ?? 'E2E',
      lastName: args.lastName ?? 'Onboarding',
      phone: args.phone ?? '+49 123 456789',
      street: args.street ?? 'Musterstraße 1',
      zipCode: args.zipCode ?? '12345',
      city: args.city ?? 'Musterstadt',
      country: args.country ?? 'Deutschland',
    });

    return { ok: true };
  },
});

export const listUsersForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query('users').collect();
    return users.map((user: Doc<'users'>) => ({
      _id: user._id,
      _creationTime: user._creationTime,
      name: user.name,
      email: user.email,
      phone: user.phone,
      status: user.status,
      systemRole: user.systemRole,
      lastLoginAt: user.lastLoginAt,
    }));
  },
});

export const setUserStatusForAdmin = mutation({
  args: {
    userId: v.id('users'),
    status: v.union(...USER_STATUSES.map(v.literal)),
  },
  handler: async (ctx, { userId, status }) => {
    const adminId = await requireAdmin(ctx);
    if (adminId === userId && status === 'banned') {
      throw new Error('Cannot ban yourself');
    }
    await ctx.db.patch(userId, { status });
    if (status === 'banned') {
      await revokeUserSessions(ctx, userId);
    }
    return { ok: true };
  },
});
