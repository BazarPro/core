import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { api } from './_generated/api';
import { getAuthUserId } from '@convex-dev/auth/server';
import type { DatabaseReader, DatabaseWriter } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { EventRoles } from './constants';

async function isAdminUser(ctx: { db: DatabaseReader }, userId: Id<'users'>): Promise<boolean> {
  const user = await ctx.db.get(userId);
  return user?.systemRole === 'admin';
}

function rolesAllowAdminBypass(roles: EventRoles[]): boolean {
  return roles.includes('organizer') || roles.includes('coorganizer');
}

/**
 * Checks if a user has a specific role for an event
 * @param ctx - Database context with read access
 * @param eventId - ID of the event
 * @param userId - ID of the user
 * @param role - Role to check for
 * @returns Promise<boolean> - True if user has the role
 */
export async function hasEventRole(
  ctx: { db: DatabaseReader },
  eventId: Id<'events'>,
  userId: Id<'users'>,
  role: EventRoles
): Promise<boolean> {
  const existing = await ctx.db
    .query('eventRole')
    .withIndex('by_event_user_role', (q) =>
      q.eq('event', eventId).eq('user', userId).eq('roles', role)
    )
    .unique();
  return !!existing;
}

export async function hasEventRoleOrAdmin(
  ctx: { db: DatabaseReader },
  eventId: Id<'events'>,
  userId: Id<'users'>,
  role: EventRoles
): Promise<boolean> {
  if ((role === 'organizer' || role === 'coorganizer') && (await isAdminUser(ctx, userId))) {
    return true;
  }
  return hasEventRole(ctx, eventId, userId, role);
}

/**
 * Removes a specific role from a user for an event
 * @param ctx - Database context with write access
 * @param eventId - ID of the event
 * @param userId - ID of the user
 * @param role - Role to remove
 */
export async function removeEventRole(
  ctx: { db: DatabaseWriter },
  eventId: Id<'events'>,
  userId: Id<'users'>,
  role: EventRoles
): Promise<void> {
  const entry = await ctx.db
    .query('eventRole')
    .withIndex('by_event_user_role', (q) =>
      q.eq('event', eventId).eq('user', userId).eq('roles', role)
    )
    .unique();
  if (entry) {
    await ctx.db.delete(entry._id);
  }
}

/**
 * Checks if a user has any of the specified roles for an event
 * @param ctx - Database context with read access
 * @param eventId - ID of the event
 * @param userId - ID of the user
 * @param roles - Array of roles to check for
 * @returns Promise<boolean> - True if user has any of the roles
 */
export async function hasAnyEventRole(
  ctx: { db: DatabaseReader },
  eventId: Id<'events'>,
  userId: Id<'users'>,
  roles: EventRoles[]
): Promise<boolean> {
  for (const role of roles) {
    if (await hasEventRole(ctx, eventId, userId, role)) {
      return true;
    }
  }
  return false;
}

export async function hasAnyEventRoleOrAdmin(
  ctx: { db: DatabaseReader },
  eventId: Id<'events'>,
  userId: Id<'users'>,
  roles: EventRoles[]
): Promise<boolean> {
  if (rolesAllowAdminBypass(roles) && (await isAdminUser(ctx, userId))) {
    return true;
  }
  return hasAnyEventRole(ctx, eventId, userId, roles);
}

/**
 * Checks if the user is an organizer or co-organizer of any event that contains the specified product
 * @param args.productId - ID of the product to check
 * @param args.userId - ID of the user (optional)
 * @returns Promise<Id<'events'> | null> - Event ID if user is organizer, null otherwise
 */
export const isOrganizerOfAnyProductEvent = query({
  args: { productId: v.id('products'), userId: v.optional(v.id('users')) },
  handler: async (ctx, args) => {
    if (!args.userId) return null;

    const eventIds: Id<'events'>[] = await ctx.runQuery(api.eventProducts.getEventIdsForProduct, {
      productId: args.productId,
    });

    for (const eventId of eventIds) {
      if (await hasAnyEventRole(ctx, eventId, args.userId, ['organizer', 'coorganizer'])) {
        return eventId; // Return the first eventId where the user is an organizer
      }
    }

    return null;
  },
});

export type VendorWithCalculations = Doc<'users'> & {
  totalRevenue: number;
  commission: number;
  payout: number;
  paid: boolean;
  grossRevenue: number;
  totalDiscount: number;
  isHelper: boolean;
};

/**
 * Gets all vendors for an event with their revenue calculations and roles
 * @param args.eventId - ID of the event
 * @returns Promise<VendorWithCalculations[]> - Array of vendors with calculations
 */
export const getVendorsForEvent = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    if (!(await hasAnyEventRoleOrAdmin(ctx, args.eventId, userId, ['organizer', 'coorganizer']))) {
      throw new Error('Not authorized');
    }

    const sellerRoles = await ctx.db
      .query('eventRole')
      .withIndex('by_event_role', (q) => q.eq('event', args.eventId).eq('roles', 'seller'))
      .collect();

    const vendorIds = [...new Set(sellerRoles.map((r) => r.user))];
    const vendors = await Promise.all(vendorIds.map((id) => ctx.db.get(id)));
    const vendorDocs = vendors.filter((v): v is Doc<'users'> => v !== null);

    const vendorsWithCalculations: VendorWithCalculations[] = await Promise.all(
      vendorDocs.map(async (vendor) => {
        const purchases = await ctx.db
          .query('purchase')
          .withIndex('by_event_seller', (q) => q.eq('event', args.eventId).eq('seller', vendor._id))
          .collect();

        const totalRevenue = purchases.reduce((acc, p) => acc + p.totalAmount, 0);
        const commission = purchases.reduce((acc, p) => acc + p.comissionAmount, 0);
        const payout = purchases.reduce((acc, p) => acc + p.payoutAmount, 0);

        // For the breakdown table
        const grossRevenue = purchases.reduce((acc, p) => {
          const originalPrice = p.discountPercent
            ? p.totalAmount / (1 - p.discountPercent / 100)
            : p.totalAmount;
          return acc + originalPrice;
        }, 0);
        const totalDiscount = grossRevenue - totalRevenue;

        const sellerRow = await ctx.db
          .query('eventSeller')
          .withIndex('by_event_user', (q) => q.eq('event', args.eventId).eq('user', vendor._id))
          .first();
        const paid = sellerRow?.payoutReceived ?? false;

        // Check if this vendor is also a helper (coorganizer)
        const helperRole = await ctx.db
          .query('eventRole')
          .withIndex('by_event_user_role', (q) =>
            q.eq('event', args.eventId).eq('user', vendor._id).eq('roles', 'coorganizer')
          )
          .unique();

        return {
          ...vendor,
          totalRevenue,
          commission,
          payout,
          paid,
          grossRevenue,
          totalDiscount,
          isHelper: !!helperRole,
        };
      })
    );

    return vendorsWithCalculations;
  },
});

/**
 * Checks whether a user has the role "seller" in any event.
 *
 * Queries the eventRole table to determine if the user
 * is assigned the "seller" role.
 *
 * @param userId - The ID of the user to check
 * @returns true if the user has at least one "seller" role, otherwise false
 */
export const isSeller = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const sellerRoles = await ctx.db
      .query('eventRole')
      .withIndex('by_user_role', (q) => q.eq('user', args.userId).eq('roles', 'seller'))
      .first();
    return !!sellerRoles;
  },
});

/**
 * Gets all co-organizer user IDs for an event
 * @param args.eventId - ID of the event
 * @returns Promise<Id<'users'>[]> - Array of co-organizer user IDs
 */
export const getCoOrganizerIdsForEvent = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    if (!(await hasAnyEventRoleOrAdmin(ctx, args.eventId, userId, ['organizer', 'coorganizer']))) {
      throw new Error('Not authorized');
    }

    const roles = await ctx.db
      .query('eventRole')
      .withIndex('by_event_role', (q) => q.eq('event', args.eventId).eq('roles', 'coorganizer'))
      .collect();
    return roles.map((r) => r.user);
  },
});

/**
 * Gets all roles for the current user for a specific event
 * @param args.eventId - ID of the event
 * @returns Promise<EventRoles[]> - Array of roles the user has for the event
 */
export const getMyRolesForEvent = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    if (await isAdminUser(ctx, userId)) return ['organizer'];
    const roles = await ctx.db
      .query('eventRole')
      .withIndex('by_event_user_role', (q) => q.eq('event', args.eventId).eq('user', userId))
      .collect();
    return roles.map((r) => r.roles);
  },
});

/**
 * Gets all roles for the current user across multiple events
 * @param args.eventIds - Array of event IDs to check
 * @returns Promise<{eventId: Id<'events'>, roles: EventRoles[]}[]> - Array of event-role mappings
 */
export const getMyRolesForEvents = query({
  args: { eventIds: v.array(v.id('events')) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const roles = await ctx.db
      .query('eventRole')
      .withIndex('by_user_role', (q) => q.eq('user', userId))
      .collect();

    const eventIdSet = new Set(args.eventIds.map((id) => id));
    const filtered = roles.filter((r) => eventIdSet.has(r.event));

    const byEvent = new Map<Id<'events'>, EventRoles[]>();
    for (const role of filtered) {
      const existing = byEvent.get(role.event) ?? [];
      if (!existing.includes(role.roles)) {
        existing.push(role.roles);
      }
      byEvent.set(role.event, existing);
    }

    return [...byEvent.entries()].map(([eventId, roles]) => ({
      eventId,
      roles,
    }));
  },
});

/**
 * Adds a co-organizer role to a user for an event
 * @param args.eventId - ID of the event
 * @param args.userId - ID of the user to add as co-organizer
 * @returns Promise<{success: boolean}> - Success status
 */
export const addCoOrganizerForEvent = mutation({
  args: { eventId: v.id('events'), userId: v.id('users') },
  handler: async (ctx, args) => {
    const viewerId = await getAuthUserId(ctx);
    if (!viewerId) throw new Error('Not authenticated');

    if (!(await hasEventRoleOrAdmin(ctx, args.eventId, viewerId, 'organizer'))) {
      throw new Error('Not authorized to assign co-organizers');
    }

    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error('Event not found');
    if (event.organizerId === args.userId) {
      throw new Error('Organizer already has full permissions');
    }

    const isSeller = await hasEventRole(ctx, args.eventId, args.userId, 'seller');
    if (!isSeller) {
      throw new Error('User is not a participant of this event');
    }

    const existing = await ctx.db
      .query('eventRole')
      .withIndex('by_event_user_role', (q) =>
        q.eq('event', args.eventId).eq('user', args.userId).eq('roles', 'coorganizer')
      )
      .unique();

    if (!existing) {
      await ctx.db.insert('eventRole', {
        event: args.eventId,
        user: args.userId,
        roles: 'coorganizer',
      });
    }

    return { success: true };
  },
});

/**
 * Removes a co-organizer role from a user for an event
 * @param args.eventId - ID of the event
 * @param args.userId - ID of the user to remove as co-organizer
 * @returns Promise<{success: boolean}> - Success status
 */
export const removeCoOrganizerForEvent = mutation({
  args: { eventId: v.id('events'), userId: v.id('users') },
  handler: async (ctx, args) => {
    const viewerId = await getAuthUserId(ctx);
    if (!viewerId) throw new Error('Not authenticated');

    if (!(await hasEventRoleOrAdmin(ctx, args.eventId, viewerId, 'organizer'))) {
      throw new Error('Not authorized to remove co-organizers');
    }

    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error('Event not found');
    if (event.organizerId === args.userId) {
      throw new Error('Organizer role cannot be removed');
    }

    await removeEventRole(ctx, args.eventId, args.userId, 'coorganizer');
    return { success: true };
  },
});
