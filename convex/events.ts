import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { hasEventRoleOrAdmin, removeEventRole, type VendorWithCalculations } from './eventRoles';
import { api } from './_generated/api';
import type { Id, Doc } from './_generated/dataModel';
import type { DatabaseReader, MutationCtx, QueryCtx } from './_generated/server';
import type { EventServices, EventVisibility } from './constants';

async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error('Not authenticated');
  }
  const user = await ctx.db.get(userId);
  if (user?.systemRole !== 'admin') {
    throw new Error('Not authorized');
  }
  return userId;
}

async function isAdminUser(ctx: { db: DatabaseReader }, userId: Id<'users'>): Promise<boolean> {
  const user = await ctx.db.get(userId);
  return user?.systemRole === 'admin';
}

function isEventApproved(event: { isApproved?: boolean; approvalStatus?: string }): boolean {
  if (event.approvalStatus === 'rejected' || event.approvalStatus === 'pending') {
    return false;
  }
  if (event.approvalStatus === 'approved') {
    return true;
  }
  return event.isApproved !== false;
}

/**
 * Gets all events where the current user is an organizer or co-organizer
 * @returns Promise<Doc<'events'>[]> - Array of events the user organizes
 */
export const getMyEvents = query({
  args: {
    includePast: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      throw new Error('Not authenticated');
    }

    const organizerRoles = await ctx.db
      .query('eventRole')
      .withIndex('by_user_role', (q) => q.eq('user', userId).eq('roles', 'organizer'))
      .collect();
    const coOrganizerRoles = await ctx.db
      .query('eventRole')
      .withIndex('by_user_role', (q) => q.eq('user', userId).eq('roles', 'coorganizer'))
      .collect();
    const eventIds = new Set([
      ...organizerRoles.map((r) => r.event),
      ...coOrganizerRoles.map((r) => r.event),
    ]);
    const events = await Promise.all([...eventIds].map((id) => ctx.db.get(id)));
    const allEvents = events.filter((e): e is Doc<'events'> => e !== null);

    if (args.includePast) {
      return allEvents;
    }

    const now = Date.now();
    return allEvents.filter((event) => event.endDate >= now);
  },
});

/**
 * Gets all events, showing public events to unauthenticated users
 * @returns Promise<Doc<'events'>[]> - Array of all events or public events only
 */
export const get = query({
  args: {
    includePast: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let events = await ctx.db.query('events').collect();
    const userId = await getAuthUserId(ctx);

    if (!args.includePast) {
      const now = Date.now();
      events = events.filter((event) => event.endDate >= now);
    }

    if (userId) {
      const isAdmin = await isAdminUser(ctx, userId as Id<'users'>);
      if (isAdmin) return events;
      return events.filter((event) => event.visibility !== 'public' || isEventApproved(event));
    }

    return events.filter((event) => event.visibility === 'public' && isEventApproved(event));
  },
});

export const getPublicEventsForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const events = await ctx.db.query('events').collect();
    const publicEvents = events.filter((event) => event.visibility === 'public');
    const enriched = await Promise.all(
      publicEvents.map(async (event) => {
        const organizer = await ctx.db.get(event.organizerId);
        return {
          ...event,
          organizerName: organizer?.name,
          organizerEmail: organizer?.email,
        };
      })
    );
    return enriched;
  },
});

export const getEventsForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const events = await ctx.db.query('events').collect();
    const enriched = await Promise.all(
      events.map(async (event) => {
        const organizer = await ctx.db.get(event.organizerId);
        const approvalStatus = event.approvalStatus
          ? event.approvalStatus
          : isEventApproved(event)
            ? 'approved'
            : 'pending';
        return {
          ...event,
          isApproved: isEventApproved(event),
          approvalStatus,
          organizerName: organizer?.name,
          organizerEmail: organizer?.email,
        };
      })
    );
    return enriched;
  },
});

export const approveEventForAdmin = mutation({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    const adminId = await requireAdmin(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error('Event not found');
    await ctx.db.patch(args.eventId, {
      isApproved: true,
      approvalStatus: 'approved',
      approvedAt: Date.now(),
      approvedBy: adminId,
      rejectedAt: undefined,
      rejectedBy: undefined,
      rejectionReason: undefined,
    });
  },
});

export const rejectEventForAdmin = mutation({
  args: { eventId: v.id('events'), reason: v.string() },
  handler: async (ctx, args) => {
    const adminId = await requireAdmin(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error('Event not found');
    const trimmedReason = args.reason.trim();
    if (!trimmedReason) {
      throw new Error('Rejection reason is required');
    }
    await ctx.db.patch(args.eventId, {
      isApproved: false,
      approvalStatus: 'rejected',
      approvedAt: undefined,
      approvedBy: undefined,
      rejectedAt: Date.now(),
      rejectedBy: adminId,
      rejectionReason: trimmedReason,
    });
  },
});

export const requestEventReviewForOrganizer = mutation({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    if (!(await hasEventRoleOrAdmin(ctx, args.eventId, userId, 'organizer'))) {
      throw new Error('Not authorized');
    }
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error('Event not found');
    if (event.visibility !== 'public') {
      throw new Error('Event is not public');
    }
    await ctx.db.patch(args.eventId, {
      isApproved: false,
      approvalStatus: 'pending',
      approvedAt: undefined,
      approvedBy: undefined,
      rejectedAt: undefined,
      rejectedBy: undefined,
      rejectionReason: undefined,
    });
  },
});

/**
 * Gets a single event with cover image URL and category labels
 * @param args.id - ID of the event to retrieve
 * @returns Promise<Doc<'events'> & {coverImageUrl: string | null, categoryLabels: string[]} | null>
 */
export const getEvent = query({
  args: {
    id: v.id('events'),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.id);
    if (!event) {
      return null;
    } else {
      const userId = await getAuthUserId(ctx);
      if (!userId) {
        if (event.visibility !== 'public' || !isEventApproved(event)) {
          return null;
        }
      } else {
        const isAdmin = await isAdminUser(ctx, userId as Id<'users'>);
        if (!isAdmin && event.visibility === 'public' && !isEventApproved(event)) {
          const hasRole =
            (await hasEventRoleOrAdmin(ctx, args.id, userId, 'organizer')) ||
            (await hasEventRoleOrAdmin(ctx, args.id, userId, 'coorganizer')) ||
            (await hasEventRoleOrAdmin(ctx, args.id, userId, 'seller'));
          if (!hasRole) {
            return null;
          }
        }
      }

      const coverImage = event.coverImage ? await ctx.storage.getUrl(event.coverImage) : null;
      const eventMapImageUrlResolved = event.eventMapImage
        ? await ctx.storage.getUrl(event.eventMapImage)
        : null;

      const categories = await Promise.all(
        event.categories.map(async (catId) => {
          const cat = await ctx.db.get(catId);
          return cat?.label;
        })
      );

      return {
        ...event,
        coverImageUrl: coverImage,
        eventMapImageUrl: eventMapImageUrlResolved,
        categoryLabels: categories.filter((c) => c !== undefined) as string[],
      };
    }
  },
});

export const getPublicEventForViewer = query({
  args: {
    id: v.id('events'),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.id);
    if (!event) {
      return null;
    }

    if (event.visibility !== 'public') {
      return null;
    }

    const userId = await getAuthUserId(ctx);
    const approved = isEventApproved(event);
    if (!approved) {
      if (!userId) return null;
      const isAdmin = await isAdminUser(ctx, userId as Id<'users'>);
      if (!isAdmin && event.organizerId !== userId) {
        return null;
      }
    }

    const coverImage = event.coverImage ? await ctx.storage.getUrl(event.coverImage) : null;
    const eventMapImageUrl = event.eventMapImage
      ? await ctx.storage.getUrl(event.eventMapImage)
      : null;

    const categories = await Promise.all(
      event.categories.map(async (catId) => {
        const cat = await ctx.db.get(catId);
        return cat?.label;
      })
    );

    return {
      ...event,
      coverImageUrl: coverImage,
      eventMapImageUrl,
      categoryLabels: categories.filter((c) => c !== undefined) as string[],
    };
  },
});

/**
 * Gets multiple events by their IDs
 * @param args.ids - Array of event IDs to retrieve
 * @returns Promise<Doc<'events'>[]> - Array of events (filtered for existing ones)
 */
export const getEvents = query({
  args: {
    ids: v.array(v.id('events')),
  },
  handler: async (ctx, args) => {
    const events = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
    return events.filter((e): e is Doc<'events'> => e !== null);
  },
});

/**
 * Creates a new event and assigns the creator as organizer
 */
export const createEvent = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    coverImage: v.optional(v.id('_storage')),
    eventMapImage: v.optional(v.id('_storage')),
    location: v.string(),
    startDate: v.number(),
    endDate: v.number(),
    contactInfo: v.string(),
    categories: v.array(v.id('categories')),
    services: v.array(v.string()),
    visibility: v.string(),
    accessCode: v.optional(v.string()),
    vendorLimit: v.optional(v.number()),
    commission: v.number(),
  },
  handler: async (ctx, args) => {
    const flag = await ctx.db
      .query('featureFlags')
      .withIndex('by_key', (q) => q.eq('key', 'is_event_creation_enabled'))
      .unique();

    if (flag && !flag.value) {
      throw new Error('Event creation is currently disabled.');
    }

    const userId = await getAuthUserId(ctx);

    if (!userId) {
      throw new Error('Not authenticated');
    }

    const isPublic = args.visibility === 'public';
    const approvalPatch = isPublic
      ? { isApproved: false, approvalStatus: 'pending' as const }
      : {
          isApproved: true,
          approvalStatus: 'approved' as const,
        };

    const eventId = await ctx.db.insert('events', {
      ...args,
      organizerId: userId,
      ...approvalPatch,
      visibility: args.visibility as EventVisibility,
      services: args.services as EventServices[],
    });

    // Set User as Organizer for his Event
    const existingOrganizerRole = await ctx.db
      .query('eventRole')
      .withIndex('by_event_user_role', (q) =>
        q.eq('event', eventId).eq('user', userId).eq('roles', 'organizer')
      )
      .unique();
    if (!existingOrganizerRole) {
      await ctx.db.insert('eventRole', {
        event: eventId,
        user: userId,
        roles: 'organizer',
      });
    }

    return eventId;
  },
});

/**
 * Edits an existing event (organizer only)
 */
export const editEvent = mutation({
  args: {
    id: v.id('events'),
    title: v.string(),
    description: v.string(),
    coverImage: v.optional(v.id('_storage')),
    eventMapImage: v.optional(v.id('_storage')),
    location: v.string(),
    startDate: v.number(),
    endDate: v.number(),
    categories: v.array(v.id('categories')),
    contactInfo: v.string(),
    commission: v.number(),
    services: v.array(v.string()),
    visibility: v.string(),
    accessCode: v.optional(v.string()),
    vendorLimit: v.optional(v.number()),
    clearCoverImage: v.optional(v.boolean()),
    clearEventMapImage: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const { id, clearCoverImage, clearEventMapImage, ...rest } = args;

    if (!userId) {
      throw new Error('Not authenticated');
    }

    const event = await ctx.db.get(args.id);
    if (!event) throw new Error('Event not found');

    if (event.endDate < Date.now()) {
      throw new Error('Vergangene Veranstaltungen können nicht mehr bearbeitet werden.');
    }

    if (!(await hasEventRoleOrAdmin(ctx, args.id, userId, 'organizer'))) {
      throw new Error('Not authorized to edit this event');
    }

    const isMakingPublic = event.visibility !== 'public' && args.visibility === 'public';
    const approvalPatch = isMakingPublic
      ? {
          isApproved: false,
          approvalStatus: 'pending' as const,
        }
      : {};

    const patchData = {
      ...rest,
      ...approvalPatch,
      visibility: rest.visibility as EventVisibility,
      services: rest.services as EventServices[],
    };

    if (clearCoverImage || clearEventMapImage) {
      await ctx.db.patch(id, {
        ...patchData,
        ...(clearCoverImage ? { coverImage: undefined } : {}),
        ...(clearEventMapImage ? { eventMapImage: undefined } : {}),
      });
      return;
    }

    await ctx.db.patch(id, patchData);
  },
});

/**
 * Deletes an event (organizer only)
 */
export const deleteEvent = mutation({
  args: {
    id: v.id('events'),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const id = args.id;

    if (!userId) {
      throw new Error('Not authenticated');
    }

    const event = await ctx.db.get(id);
    if (!event) throw new Error('Event not found');

    if (event.endDate < Date.now()) {
      throw new Error('Vergangene Veranstaltungen können nicht gelöscht werden.');
    }

    if (!(await hasEventRoleOrAdmin(ctx, id, userId, 'organizer'))) {
      throw new Error('Not authorized to delete this event');
    }

    const eventProducts = await ctx.db
      .query('eventProducts')
      .withIndex('by_eventId', (q) => q.eq('eventId', id))
      .collect();
    for (const ep of eventProducts) {
      if (ep.locationCategoryId) {
        await ctx.db.patch(ep._id, { locationCategoryId: undefined });
      }
    }

    const locationCategories = await ctx.db
      .query('eventLocationCategories')
      .withIndex('by_eventId', (q) => q.eq('eventId', id))
      .collect();
    for (const cat of locationCategories) {
      await ctx.db.delete(cat._id);
    }

    await ctx.db.delete(id);
  },
});

/**
 * Gets all events where the current user is registered as a seller
 */
export const getMyRegisteredEvents = query({
  args: {
    includePast: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const sellerRoles = await ctx.db
      .query('eventRole')
      .withIndex('by_user_role', (q) => q.eq('user', userId).eq('roles', 'seller'))
      .collect();
    const eventIds = sellerRoles.map((r) => r.event);

    const events = await Promise.all(eventIds.map((id) => ctx.db.get(id)));
    const allEvents = events.filter((e): e is Doc<'events'> => e !== null);

    if (args.includePast) {
      return allEvents;
    }

    const now = Date.now();
    return allEvents.filter((event) => event.endDate >= now);
  },
});

/**
 * Allows a seller to leave an event (with various checks)
 */
export const leaveEvent = mutation({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error('Event not found');

    if (event.endDate < Date.now()) {
      throw new Error('Abmeldung nicht möglich: Veranstaltung liegt bereits in der Vergangenheit.');
    }

    const eventSeller = await ctx.db
      .query('eventSeller')
      .withIndex('by_event_user', (q) => q.eq('event', args.eventId).eq('user', userId))
      .first();

    if (eventSeller?.payoutReceived) {
      throw new Error('Abmeldung nicht möglich: Auszahlung bereits erhalten.');
    }

    const eventProducts = await ctx.db
      .query('eventProducts')
      .withIndex('by_eventId', (q) => q.eq('eventId', args.eventId))
      .collect();

    for (const ep of eventProducts) {
      const product = await ctx.db.get(ep.productId);
      if (product?.vendorId === userId) {
        if (['available', 'sold', 'returned'].includes(ep.status)) {
          throw new Error(
            'Abmeldung nicht möglich: Es gibt bereits Produkte mit Status Verfügbar, Verkauft oder Zurückgegeben.'
          );
        }
        await ctx.db.delete(ep._id);
      }
    }

    if (eventSeller) {
      await ctx.db.delete(eventSeller._id);
    }

    await removeEventRole(ctx, args.eventId, userId, 'seller');
  },
});

/**
 * Gets the count of products the current user has for a specific event
 */
export const getMyProductCountForEvent = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return 0;

    const userProducts = await ctx.db
      .query('products')
      .withIndex('by_vendorId', (q) => q.eq('vendorId', userId))
      .collect();

    const eventProducts = await Promise.all(
      userProducts.map((p) =>
        ctx.db
          .query('eventProducts')
          .withIndex('by_eventId_productId', (q) =>
            q.eq('eventId', args.eventId).eq('productId', p._id)
          )
          .unique()
      )
    );

    return eventProducts.filter((r) => r !== null).length;
  },
});

/**
 * Gets a financial summary for an event (Kassensturz)
 */
export const getEventFinancialSummary = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    const purchases = await ctx.db
      .query('purchase')
      .withIndex('by_event_seller', (q) => q.eq('event', args.eventId))
      .collect();

    const totalGrossRevenue = purchases.reduce((acc: number, p) => {
      const originalPrice = p.discountPercent
        ? p.totalAmount / (1 - p.discountPercent / 100)
        : p.totalAmount;
      return acc + originalPrice;
    }, 0);

    const totalNetRevenue = purchases.reduce((acc, p) => acc + p.totalAmount, 0);
    const totalDiscounts = totalGrossRevenue - totalNetRevenue;
    const totalCommission = purchases.reduce((acc, p) => acc + p.comissionAmount, 0);
    const totalPayoutSoll = purchases.reduce((acc, p) => acc + p.payoutAmount, 0);

    const vendors: VendorWithCalculations[] = await ctx.runQuery(
      api.eventRoles.getVendorsForEvent,
      {
        eventId: args.eventId,
      }
    );
    const totalPaidOut = vendors
      .filter((v) => v.paid)
      .reduce((acc: number, v) => acc + v.payout, 0);
    const totalPendingPayout = vendors
      .filter((v) => !v.paid)
      .reduce((acc: number, v) => acc + v.payout, 0);

    return {
      totalGrossRevenue,
      totalNetRevenue,
      totalDiscounts,
      totalCommission,
      totalPayoutSoll,
      totalPaidOut,
      totalPendingPayout,
      cashInHandSoll: totalNetRevenue - totalPaidOut,
      salesCount: purchases.length,
      vendorsPaidCount: vendors.filter((v) => v.paid).length,
      vendorsTotalCount: vendors.length,
    };
  },
});
