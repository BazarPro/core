import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api } from '../_generated/api';

describe('Convex Events Tests', () => {
  test('User can create an event', async () => {
    const t = convexTest(schema);

    // 1. Create user in DB
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'User A',
        email: 'test@example.com',
        systemRole: 'admin',
      });
    });

    // 2. Log in as "User A" and create event
    const category = await t
      .withIdentity({ subject: userId })
      .mutation(api.categories.createCategory, {
        label: 'Music',
      });

    const eventId = await t.withIdentity({ subject: userId }).mutation(api.events.createEvent, {
      title: 'Mein cooles Event',
      description: 'Beschreibung',
      location: 'Berlin',
      startDate: Date.now() + 1000000,
      endDate: Date.now() + 2000000,
      categories: [category],
      services: [],
      contactInfo: 'test@test.de',
      commission: 10,
      visibility: 'public',
    });

    // Test line 100 in events.ts: role already exists
    // (This part of logic is hard to trigger with createEvent as it's a new ID, but we can verify that the flag is hit)
    // We add a test for disabled event creation
    await t.run(async (ctx) => {
      await ctx.db.insert('featureFlags', { key: 'is_event_creation_enabled', value: false });
    });
    await expect(
      t.withIdentity({ subject: userId }).mutation(api.events.createEvent, {
        title: 'Disabled Event',
        description: '...',
        location: '...',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [category],
        services: [],
        contactInfo: '...',
        commission: 0,
        visibility: 'public',
      })
    ).rejects.toThrow('Event creation is currently disabled.');

    // 3. Check if it is in the DB
    const event = await t
      .withIdentity({ subject: userId })
      .query(api.events.getEvent, { id: eventId });
    expect(event).not.toBeNull();
    expect(event?.title).toBe('Mein cooles Event');
    expect(event?.organizerId).toBe(userId);
  });

  test("User cannot delete another user's event", async () => {
    const t = convexTest(schema);

    // 1. Create two users in DB
    const userAId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'User A',
        email: 'usera@example.com',
        systemRole: 'admin',
      });
    });

    const userBId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'User B',
        email: 'userb@example.com',
      });
    });

    // 2. Log in as "User A" and create event
    const category = await t
      .withIdentity({ subject: userAId })
      .mutation(api.categories.createCategory, {
        label: 'Music',
      });
    const eventId = await t.withIdentity({ subject: userAId }).mutation(api.events.createEvent, {
      title: 'User A Event',
      description: 'Beschreibung',
      location: 'Berlin',
      startDate: Date.now() + 1000000,
      endDate: Date.now() + 2000000,
      categories: [category],
      services: [],
      contactInfo: 'test@test.de',
      commission: 10,
      visibility: 'public',
    });

    // 3. Log in as "User B" and try to delete User A's event
    await expect(
      t.withIdentity({ subject: userBId }).mutation(api.events.deleteEvent, { id: eventId })
    ).rejects.toThrow('Not authorized to delete this event');
  });

  test('User can delete their own event', async () => {
    const t = convexTest(schema);

    // 1. Create user in DB
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'User A',
        email: 'usera@example.com',
        systemRole: 'admin',
      });
    });

    // 2. Log in as "User A" and create event
    const category = await t
      .withIdentity({ subject: userId })
      .mutation(api.categories.createCategory, {
        label: 'Music',
      });
    const eventId = await t.withIdentity({ subject: userId }).mutation(api.events.createEvent, {
      title: 'User A Event',
      description: 'Beschreibung',
      location: 'Berlin',
      startDate: Date.now() + 1000000,
      endDate: Date.now() + 2000000,
      categories: [category],
      services: [],
      contactInfo: 'test@test.de',
      commission: 10,
      visibility: 'public',
    });
    // 3. Log in as "User A" and delete their event
    await t.withIdentity({ subject: userId }).mutation(api.events.deleteEvent, { id: eventId });

    // 4. Verify the event is deleted
    const event = await t.query(api.events.getEvent, { id: eventId });
    expect(event).toBeNull();
  });

  test('deleteEvent removes eventLocationCategories and clears eventProduct location refs', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'User Loc',
        email: `userloc-${Date.now()}@example.com`,
        systemRole: 'admin',
      });
    });
    const category = await t
      .withIdentity({ subject: userId })
      .mutation(api.categories.createCategory, { label: 'Music' });
    const eventId = await t.withIdentity({ subject: userId }).mutation(api.events.createEvent, {
      title: 'Loc Event',
      description: 'Beschreibung',
      location: 'Berlin',
      startDate: 4102444800000, // Year 2100
      endDate: 4102531200000,
      categories: [category],
      services: [],
      contactInfo: 'test@test.de',
      commission: 10,
      visibility: 'public',
    });
    const vendorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'V', email: `vdl-${Date.now()}@test.com` });
    });
    const productId = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'P',
        description: 'D',
        price: 1,
        productCategory: category,
        images: [],
        vendorId,
        readyForSale: true,
        sold: false,
        condition: 'new',
        updatedAt: Date.now(),
      });
    });
    const locId = await t.run(async (ctx) => {
      return await ctx.db.insert('eventLocationCategories', {
        eventId,
        label: 'R1',
      });
    });
    const epId = await t.run(async (ctx) => {
      return await ctx.db.insert('eventProducts', {
        eventId,
        productId,
        status: 'announced',
        locationCategoryId: locId,
      });
    });

    await t.withIdentity({ subject: userId }).mutation(api.events.deleteEvent, { id: eventId });

    expect(await t.run(async (ctx) => ctx.db.get(eventId))).toBeNull();
    expect(await t.run(async (ctx) => ctx.db.get(locId))).toBeNull();
    const ep = await t.run(async (ctx) => ctx.db.get(epId));
    expect(ep?.locationCategoryId).toBeUndefined();
    const remainingCats = await t.run(async (ctx) =>
      ctx.db
        .query('eventLocationCategories')
        .withIndex('by_eventId', (q) => q.eq('eventId', eventId))
        .collect()
    );
    expect(remainingCats).toHaveLength(0);
  });

  test('Unauthenticated user cannot create event', async () => {
    const t = convexTest(schema);

    //create category
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'User A',
        email: 'test@example.com',
        systemRole: 'admin',
      });
    });
    const category = await t
      .withIdentity({ subject: userId })
      .mutation(api.categories.createCategory, {
        label: 'Music',
      });

    await expect(
      t.mutation(api.events.createEvent, {
        title: 'Unauthorized Event',
        description: 'Beschreibung',
        location: 'Berlin',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [category],
        services: [],
        contactInfo: 'test@test.de',
        commission: 10,
        visibility: 'public',
      })
    ).rejects.toThrow('Not authenticated');
  });

  test('Unauthenticated user cannot delete event', async () => {
    const t = convexTest(schema);

    // 1. Create user in DB
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'User A',
        email: 'usera@example.com',
        systemRole: 'admin',
      });
    });

    // 2. Log in as "User A" and create event
    const category = await t
      .withIdentity({ subject: userId })
      .mutation(api.categories.createCategory, {
        label: 'Music',
      });
    const eventId = await t.withIdentity({ subject: userId }).mutation(api.events.createEvent, {
      title: 'User A Event',
      description: 'Beschreibung',
      location: 'Berlin',
      startDate: Date.now() + 1000000,
      endDate: Date.now() + 2000000,
      categories: [category],
      services: [],
      contactInfo: 'test@test.de',
      commission: 10,
      visibility: 'public',
    });
    // 3. Try to delete the event without authentication
    await expect(t.mutation(api.events.deleteEvent, { id: eventId })).rejects.toThrow(
      'Not authenticated'
    );
  });

  test('Unauthenticated user cannot edit event', async () => {
    const t = convexTest(schema);

    // 1. Create user in DB
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'User A',
        email: 'usera@example.com',
        systemRole: 'admin',
      });
    });

    const category = await t
      .withIdentity({ subject: userId })
      .mutation(api.categories.createCategory, {
        label: 'Misc',
      });

    // 2. Log in as "User A" and create event
    const eventId = await t.withIdentity({ subject: userId }).mutation(api.events.createEvent, {
      title: 'User A Event',
      description: 'Beschreibung',
      location: 'Berlin',
      startDate: Date.now() + 1000000,
      endDate: Date.now() + 2000000,
      categories: [category],
      services: [],
      contactInfo: 'test@test.de',
      commission: 10,
      visibility: 'public',
    });

    // 3. Try to edit the event without authentication
    await expect(
      t.mutation(api.events.editEvent, {
        id: eventId,
        title: 'Malicious Update',
        description: 'Hacked Beschreibung',
        location: 'Hacked City',
        startDate: Date.now() + 3000000,
        endDate: Date.now() + 4000000,
        categories: [],
        services: [],
        contactInfo: 'test@test.de',
        commission: 20,
        visibility: 'public',
      })
    ).rejects.toThrow('Not authenticated');
  });

  test('User can edit their own event', async () => {
    const t = convexTest(schema);

    // 1. Create user in DB
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'User A',
        email: 'usera@example.com',
        systemRole: 'admin',
      });
    });

    // 2. Log in as "User A" and create event
    const category = await t
      .withIdentity({ subject: userId })
      .mutation(api.categories.createCategory, {
        label: 'Music',
      });
    const eventId = await t.withIdentity({ subject: userId }).mutation(api.events.createEvent, {
      title: 'User A Event',
      description: 'Beschreibung',
      location: 'Berlin',
      startDate: Date.now() + 1000000,
      endDate: Date.now() + 2000000,
      categories: [category],
      services: [],
      contactInfo: 'test@test.de',
      commission: 10,
      visibility: 'public',
    });

    // 3. Edit the event
    await t.withIdentity({ subject: userId }).mutation(api.events.editEvent, {
      id: eventId,
      title: 'Updated Event Title',
      description: 'Updated Beschreibung',
      location: 'Hamburg',
      startDate: Date.now() + 3000000,
      endDate: Date.now() + 4000000,
      categories: [category],
      services: [],
      contactInfo: 'updated@test.de',
      commission: 15,
      visibility: 'logged-in',
    });

    // 4. Verify the event is updated
    const event = await t
      .withIdentity({ subject: userId })
      .query(api.events.getEvent, { id: eventId });
    expect(event).not.toBeNull();
    expect(event?.title).toBe('Updated Event Title');
    expect(event?.location).toBe('Hamburg');
  });

  test('get hides unapproved public events for unauthenticated and non-admin users', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'User', email: 'u@e.com' });
    });
    const viewerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Viewer', email: 'v@e.com' });
    });

    const pendingEventId = await t
      .withIdentity({ subject: userId })
      .mutation(api.events.createEvent, {
        title: 'Pending Public',
        description: '...',
        location: '...',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        services: [],
        contactInfo: '...',
        commission: 0,
        visibility: 'public',
      });

    const privateEventId = await t
      .withIdentity({ subject: userId })
      .mutation(api.events.createEvent, {
        title: 'Logged In Event',
        description: '...',
        location: '...',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        services: [],
        contactInfo: '...',
        commission: 0,
        visibility: 'logged-in',
      });

    const unauthEvents = await t.query(api.events.get, {});
    expect(unauthEvents.map((e) => e._id)).not.toContain(pendingEventId);

    const authEvents = await t.withIdentity({ subject: viewerId }).query(api.events.get, {});
    expect(authEvents.map((e) => e._id)).not.toContain(pendingEventId);
    expect(authEvents.map((e) => e._id)).toContain(privateEventId);
  });

  test('editEvent sets approval status when switching to public', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'User', email: 'u@e.com' });
    });

    const eventId = await t.withIdentity({ subject: userId }).mutation(api.events.createEvent, {
      title: 'Private Event',
      description: '...',
      location: '...',
      startDate: Date.now() + 1000000,
      endDate: Date.now() + 2000000,
      categories: [],
      services: [],
      contactInfo: '...',
      commission: 0,
      visibility: 'logged-in',
    });

    await t.withIdentity({ subject: userId }).mutation(api.events.editEvent, {
      id: eventId,
      title: 'Private Event',
      description: '...',
      location: '...',
      startDate: Date.now() + 1000000,
      endDate: Date.now() + 2000000,
      categories: [],
      services: [],
      contactInfo: '...',
      commission: 0,
      visibility: 'public',
    });

    const pendingEvent = await t
      .withIdentity({ subject: userId })
      .query(api.events.getEvent, { id: eventId });
    expect(pendingEvent?.approvalStatus).toBe('pending');
  });

  test('requestEventReviewForOrganizer resets rejection reason', async () => {
    const t = convexTest(schema);
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Admin',
        email: 'admin@e.com',
        systemRole: 'admin',
      });
    });
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'User', email: 'u@e.com' });
    });

    const eventId = await t.withIdentity({ subject: userId }).mutation(api.events.createEvent, {
      title: 'Rejectable',
      description: '...',
      location: '...',
      startDate: Date.now() + 1000000,
      endDate: Date.now() + 2000000,
      categories: [],
      services: [],
      contactInfo: '...',
      commission: 0,
      visibility: 'public',
    });

    await t.withIdentity({ subject: adminId }).mutation(api.events.rejectEventForAdmin, {
      eventId,
      reason: 'Missing details',
    });

    await t.withIdentity({ subject: userId }).mutation(api.events.requestEventReviewForOrganizer, {
      eventId,
    });

    const updated = await t
      .withIdentity({ subject: userId })
      .query(api.events.getEvent, { id: eventId });
    expect(updated?.approvalStatus).toBe('pending');
    expect(updated?.rejectionReason).toBeUndefined();
  });

  test('editEvent clears cover image when requested', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'User', email: 'u@e.com' });
    });

    const eventId = await t.withIdentity({ subject: userId }).mutation(api.events.createEvent, {
      title: 'Cover Event',
      description: '...',
      location: '...',
      startDate: Date.now() + 1000000,
      endDate: Date.now() + 2000000,
      categories: [],
      services: [],
      contactInfo: '...',
      commission: 0,
      visibility: 'logged-in',
    });

    await t.withIdentity({ subject: userId }).mutation(api.events.editEvent, {
      id: eventId,
      title: 'Cover Event',
      description: '...',
      location: '...',
      startDate: Date.now() + 1000000,
      endDate: Date.now() + 2000000,
      categories: [],
      services: [],
      contactInfo: '...',
      commission: 0,
      visibility: 'logged-in',
      clearCoverImage: true,
    });

    const updated = await t
      .withIdentity({ subject: userId })
      .query(api.events.getEvent, { id: eventId });
    expect(updated?.coverImage).toBeUndefined();
  });

  test("User cannot edit another user's event", async () => {
    const t = convexTest(schema);

    // 1. Create two users in DB
    const userAId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'User A',
        email: 'usera@example.com',
        systemRole: 'admin',
      });
    });

    const userBId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'User B',
        email: 'userb@example.com',
      });
    });

    // 2. Log in as "User A" and create event
    const category = await t
      .withIdentity({ subject: userAId })
      .mutation(api.categories.createCategory, {
        label: 'Music',
      });

    const eventId = await t.withIdentity({ subject: userAId }).mutation(api.events.createEvent, {
      title: 'User A Event',
      description: 'Beschreibung',
      location: 'Berlin',
      startDate: Date.now() + 1000000,
      endDate: Date.now() + 2000000,
      categories: [category],
      services: [],
      contactInfo: 'test@test.de',
      commission: 10,
      visibility: 'public',
    });

    // 3. Log in as "User B" and try to edit User A's event
    await expect(
      t.withIdentity({ subject: userBId }).mutation(api.events.editEvent, {
        id: eventId,
        title: 'Malicious Update',
        description: 'Hacked Beschreibung',
        location: 'Hacked City',
        startDate: Date.now() + 3000000,
        endDate: Date.now() + 4000000,
        categories: [category],
        services: [],
        contactInfo: 'test@test.de',
        commission: 20,
        visibility: 'public',
      })
    ).rejects.toThrow('Not authorized');
  });

  test('getMyEvents returns only events for the authenticated user', async () => {
    const t = convexTest(schema);
    const userAId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'User A',
        email: 'a@example.com',
        systemRole: 'admin',
      });
    });
    const userBId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'User B',
        email: 'b@example.com',
      });
    });

    // Create event for User A
    await t.withIdentity({ subject: userAId }).mutation(api.events.createEvent, {
      title: 'Event A',
      description: '...',
      location: 'Berlin',
      startDate: Date.now() + 1000000,
      endDate: Date.now() + 2000000,
      categories: [],
      services: [],
      contactInfo: '...',
      commission: 0,
      visibility: 'public',
    });

    // Create event for User B
    await t.withIdentity({ subject: userBId }).mutation(api.events.createEvent, {
      title: 'Event B',
      description: '...',
      location: 'Berlin',
      startDate: Date.now() + 1000000,
      endDate: Date.now() + 2000000,
      categories: [],
      services: [],
      contactInfo: '...',
      commission: 0,
      visibility: 'public',
    });

    const myEventsA = await t.withIdentity({ subject: userAId }).query(api.events.getMyEvents, {});
    expect(myEventsA).toHaveLength(1);
    expect(myEventsA[0].title).toBe('Event A');

    const myEventsB = await t.withIdentity({ subject: userBId }).query(api.events.getMyEvents, {});
    expect(myEventsB).toHaveLength(1);
    expect(myEventsB[0].title).toBe('Event B');
  });

  test('getMyEvents throws error if unauthenticated', async () => {
    const t = convexTest(schema);
    await expect(t.query(api.events.getMyEvents, {})).rejects.toThrow('Not authenticated');
  });

  test('get returns only public events for unauthenticated users', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'User', email: 'u@e.com', systemRole: 'admin' });
    });

    // Public Event
    const publicEventId = await t
      .withIdentity({ subject: userId })
      .mutation(api.events.createEvent, {
        title: 'Public Event',
        description: '...',
        location: '...',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        services: [],
        contactInfo: '...',
        commission: 0,
        visibility: 'public',
      });

    // Logged-in Event
    await t.withIdentity({ subject: userId }).mutation(api.events.createEvent, {
      title: 'Private Event',
      description: '...',
      location: '...',
      startDate: Date.now() + 1000000,
      endDate: Date.now() + 2000000,
      categories: [],
      services: [],
      contactInfo: '...',
      commission: 0,
      visibility: 'logged-in',
    });

    await t.withIdentity({ subject: userId }).mutation(api.events.approveEventForAdmin, {
      eventId: publicEventId,
    });

    const events = await t.query(api.events.get, {});
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Public Event');
  });

  test('get returns all events for authenticated users', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'User', email: 'u@e.com', systemRole: 'admin' });
    });
    const viewerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Viewer',
        email: 'v@e.com',
        systemRole: 'admin',
      });
    });

    // Public Event
    await t.withIdentity({ subject: userId }).mutation(api.events.createEvent, {
      title: 'Public Event',
      description: '...',
      location: '...',
      startDate: Date.now() + 1000000,
      endDate: Date.now() + 2000000,
      categories: [],
      services: [],
      contactInfo: '...',
      commission: 0,
      visibility: 'public',
    });

    // Logged-in Event
    await t.withIdentity({ subject: userId }).mutation(api.events.createEvent, {
      title: 'Private Event',
      description: '...',
      location: '...',
      startDate: Date.now() + 1000000,
      endDate: Date.now() + 2000000,
      categories: [],
      services: [],
      contactInfo: '...',
      commission: 0,
      visibility: 'logged-in',
    });

    const events = await t.withIdentity({ subject: viewerId }).query(api.events.get, {});
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.title)).toContain('Public Event');
    expect(events.map((e) => e.title)).toContain('Private Event');
  });

  test('getEvent returns null if not found', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'U', email: 'u@e.com' });
    });
    // Create and delete to get valid ID
    const eventId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('events', {
        title: 'T',
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        contactInfo: '',
        commission: 0,
        services: [],
        visibility: 'public',
        organizerId: userId,
      });
      await ctx.db.delete(id);
      return id;
    });

    const event = await t.query(api.events.getEvent, { id: eventId });
    expect(event).toBeNull();
  });

  test('getPublicEventForViewer restricts unapproved public events', async () => {
    const t = convexTest(schema);
    const creatorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Creator', email: 'c@e.com' });
    });
    const otherUserId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Other', email: 'o@e.com' });
    });
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Admin',
        email: 'a@e.com',
        systemRole: 'admin',
      });
    });

    const eventId = await t.withIdentity({ subject: creatorId }).mutation(api.events.createEvent, {
      title: 'Pending Public Event',
      description: '...',
      location: '...',
      startDate: Date.now() + 1000000,
      endDate: Date.now() + 2000000,
      categories: [],
      services: [],
      contactInfo: '...',
      commission: 0,
      visibility: 'public',
    });

    const unauth = await t.query(api.events.getPublicEventForViewer, { id: eventId });
    expect(unauth).toBeNull();

    const other = await t
      .withIdentity({ subject: otherUserId })
      .query(api.events.getPublicEventForViewer, { id: eventId });
    expect(other).toBeNull();

    const creator = await t
      .withIdentity({ subject: creatorId })
      .query(api.events.getPublicEventForViewer, { id: eventId });
    expect(creator?.title).toBe('Pending Public Event');

    const admin = await t
      .withIdentity({ subject: adminId })
      .query(api.events.getPublicEventForViewer, { id: eventId });
    expect(admin?.title).toBe('Pending Public Event');
  });

  test('getPublicEventForViewer allows approved public events for everyone', async () => {
    const t = convexTest(schema);
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Admin',
        email: 'admin@e.com',
        systemRole: 'admin',
      });
    });

    const eventId = await t.withIdentity({ subject: adminId }).mutation(api.events.createEvent, {
      title: 'Approved Public Event',
      description: '...',
      location: '...',
      startDate: Date.now() + 1000000,
      endDate: Date.now() + 2000000,
      categories: [],
      services: [],
      contactInfo: '...',
      commission: 0,
      visibility: 'public',
    });

    await t.withIdentity({ subject: adminId }).mutation(api.events.approveEventForAdmin, {
      eventId,
    });

    const unauth = await t.query(api.events.getPublicEventForViewer, { id: eventId });
    expect(unauth?.title).toBe('Approved Public Event');
  });

  test('editEvent throws if event not found', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'U', email: 'u@e.com' });
    });
    // Create and delete to get valid ID
    const eventId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('events', {
        title: 'T',
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        contactInfo: '',
        commission: 0,
        services: [],
        visibility: 'public',
        organizerId: userId,
      });
      await ctx.db.delete(id);
      return id;
    });

    await expect(
      t.withIdentity({ subject: userId }).mutation(api.events.editEvent, {
        id: eventId,
        title: 'New',
        description: 'New',
        location: 'New',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        services: [],
        contactInfo: '',
        commission: 0,
        visibility: 'public',
      })
    ).rejects.toThrow('Event not found');
  });

  test('deleteEvent throws if event not found', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'U', email: 'u@e.com' });
    });
    // Create and delete to get valid ID
    const eventId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('events', {
        title: 'T',
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        contactInfo: '',
        commission: 0,
        services: [],
        visibility: 'public',
        organizerId: userId,
      });
      await ctx.db.delete(id);
      return id;
    });

    await expect(
      t.withIdentity({ subject: userId }).mutation(api.events.deleteEvent, { id: eventId })
    ).rejects.toThrow('Event not found');
  });

  test('getEvents returns events for valid IDs and ignores invalid ones', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'User', email: 'u@e.com' });
    });

    const event1Id = await t.withIdentity({ subject: userId }).mutation(api.events.createEvent, {
      title: 'Event 1',
      description: '',
      location: '',
      startDate: Date.now() + 1000000,
      endDate: Date.now() + 2000000,
      categories: [],
      services: [],
      contactInfo: '',
      commission: 0,
      visibility: 'public',
    });

    const event2Id = await t.withIdentity({ subject: userId }).mutation(api.events.createEvent, {
      title: 'Event 2',
      description: '',
      location: '',
      startDate: Date.now() + 1000000,
      endDate: Date.now() + 2000000,
      categories: [],
      services: [],
      contactInfo: '',
      commission: 0,
      visibility: 'public',
    });

    // Create a fake ID that won't exist (by creating and deleting)
    const fakeId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('events', {
        title: 'Temp',
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        contactInfo: '',
        commission: 0,
        services: [],
        visibility: 'public',
        organizerId: userId,
      });
      await ctx.db.delete(id);
      return id;
    });

    const events = await t.query(api.events.getEvents, { ids: [event1Id, fakeId, event2Id] });
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.title)).toContain('Event 1');
    expect(events.map((e) => e.title)).toContain('Event 2');
  });

  test('getMyRegisteredEvents returns events user is registered for', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Participant', email: 'p@e.com' });
    });
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Organizer', email: 'o@e.com' });
    });

    const eventId = await t
      .withIdentity({ subject: organizerId })
      .mutation(api.events.createEvent, {
        title: 'Registered Event',
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        services: [],
        contactInfo: '',
        commission: 0,
        visibility: 'public',
      });

    // Register user to event (eventSeller + eventRole Seller)
    await t.run(async (ctx) => {
      await ctx.db.insert('eventSeller', {
        event: eventId,
        user: userId,
        totalFee: 0,
        comissionFee: 0,
        numberpayoutAmount: 0,
        payoutReceived: false,
      });
      await ctx.db.insert('eventRole', { event: eventId, user: userId, roles: 'seller' });
    });

    const myEvents = await t
      .withIdentity({ subject: userId })
      .query(api.events.getMyRegisteredEvents, {});
    expect(myEvents).toHaveLength(1);
    expect(myEvents[0].title).toBe('Registered Event');
  });

  test('leaveEvent removes user from eventSeller', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Participant', email: 'p@e.com' });
    });
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Organizer', email: 'o@e.com' });
    });

    const now = Date.now();

    const eventId = await t
      .withIdentity({ subject: organizerId })
      .mutation(api.events.createEvent, {
        title: 'Event to Leave',
        description: '',
        location: '',
        startDate: now + 60_000,
        endDate: now + 120_000,
        categories: [],
        services: [],
        contactInfo: '',
        commission: 0,
        visibility: 'public',
      });

    // Register user (eventSeller + eventRole Seller)
    await t.run(async (ctx) => {
      const categoryId = await ctx.db.insert('categories', { label: 'Cat', updatedAt: Date.now() });
      const productId = await ctx.db.insert('products', {
        title: 'Leave Product',
        vendorId: userId,
        description: '',
        condition: 'new',
        images: [],
        productCategory: categoryId,
        updatedAt: Date.now(),
        price: 10,
        readyForSale: true,
        sold: false,
      });
      await ctx.db.insert('eventSeller', {
        event: eventId,
        user: userId,
        totalFee: 0,
        comissionFee: 0,
        numberpayoutAmount: 0,
        payoutReceived: false,
      });
      await ctx.db.insert('eventRole', { event: eventId, user: userId, roles: 'seller' });
      await ctx.db.insert('eventProducts', {
        eventId,
        productId,
        status: 'announced',
      });
    });

    // Leave event (entfernt eventSeller und eventRole)
    await t.withIdentity({ subject: userId }).mutation(api.events.leaveEvent, { eventId });

    // Verify removed
    const myEvents = await t
      .withIdentity({ subject: userId })
      .query(api.events.getMyRegisteredEvents, {});
    expect(myEvents).toHaveLength(0);

    const remainingEventProducts = await t.run(async (ctx) => {
      return await ctx.db
        .query('eventProducts')
        .withIndex('by_eventId', (q) => q.eq('eventId', eventId))
        .collect();
    });
    expect(remainingEventProducts).toHaveLength(0);
  });

  test('leaveEvent blocks when vendor has available products in event', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Participant', email: 'blocked@e.com' });
    });
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Organizer', email: 'org-blocked@e.com' });
    });

    const now = Date.now();
    const eventId = await t
      .withIdentity({ subject: organizerId })
      .mutation(api.events.createEvent, {
        title: 'Blocked Leave Event',
        description: '',
        location: '',
        startDate: now + 60_000,
        endDate: now + 120_000,
        categories: [],
        services: [],
        contactInfo: '',
        commission: 0,
        visibility: 'public',
      });

    await t.run(async (ctx) => {
      const categoryId = await ctx.db.insert('categories', { label: 'Cat', updatedAt: Date.now() });
      const productId = await ctx.db.insert('products', {
        title: 'Blocked Product',
        vendorId: userId,
        description: '',
        condition: 'new',
        images: [],
        productCategory: categoryId,
        updatedAt: Date.now(),
        price: 20,
        readyForSale: true,
        sold: false,
      });

      await ctx.db.insert('eventSeller', {
        event: eventId,
        user: userId,
        totalFee: 0,
        comissionFee: 0,
        numberpayoutAmount: 0,
        payoutReceived: false,
      });
      await ctx.db.insert('eventRole', { event: eventId, user: userId, roles: 'seller' });
      await ctx.db.insert('eventProducts', {
        eventId,
        productId,
        status: 'available',
      });
    });

    await expect(
      t.withIdentity({ subject: userId }).mutation(api.events.leaveEvent, { eventId })
    ).rejects.toThrow(
      'Abmeldung nicht möglich: Es gibt bereits Produkte mit Status Verfügbar, Verkauft oder Zurückgegeben.'
    );
  });

  test('leaveEvent blocks when event is in the past', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Participant', email: 'past@e.com' });
    });
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Organizer', email: 'org-past@e.com' });
    });

    const now = Date.now();
    const eventId = await t
      .withIdentity({ subject: organizerId })
      .mutation(api.events.createEvent, {
        title: 'Past Event',
        description: '',
        location: '',
        startDate: now - 120_000,
        endDate: now - 60_000,
        categories: [],
        services: [],
        contactInfo: '',
        commission: 0,
        visibility: 'public',
      });

    await t.run(async (ctx) => {
      await ctx.db.insert('eventSeller', {
        event: eventId,
        user: userId,
        totalFee: 0,
        comissionFee: 0,
        numberpayoutAmount: 0,
        payoutReceived: false,
      });
      await ctx.db.insert('eventRole', { event: eventId, user: userId, roles: 'seller' });
    });

    await expect(
      t.withIdentity({ subject: userId }).mutation(api.events.leaveEvent, { eventId })
    ).rejects.toThrow('Abmeldung nicht möglich: Veranstaltung liegt bereits in der Vergangenheit.');
  });

  test('getMyProductCountForEvent counts products correctly', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Vendor', email: 'v@e.com' });
    });
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Organizer', email: 'o@e.com' });
    });

    const categoryId = await t.run(async (ctx) => {
      return await ctx.db.insert('categories', { label: 'Cat', updatedAt: Date.now() });
    });

    const eventId = await t
      .withIdentity({ subject: organizerId })
      .mutation(api.events.createEvent, {
        title: 'Event',
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        services: [],
        contactInfo: '',
        commission: 0,
        visibility: 'public',
      });

    // Create 2 products for user
    const p1 = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'P1',
        vendorId: userId,
        description: '',
        condition: 'new',
        images: [],
        productCategory: categoryId,
        price: 10,
        readyForSale: true,
        sold: false,
        updatedAt: Date.now(),
      });
    });
    const p2 = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'P2',
        vendorId: userId,
        description: '',
        condition: 'new',
        images: [],
        productCategory: categoryId,
        price: 10,
        readyForSale: true,
        sold: false,
        updatedAt: Date.now(),
      });
    });

    // Create a product for another user (should not be counted)
    const otherUserId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Other', email: 'other@e.com' });
    });
    const p3 = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        title: 'P3',
        vendorId: otherUserId,
        description: '',
        condition: 'new',
        images: [],
        productCategory: categoryId,
        price: 10,
        readyForSale: true,
        sold: false,
        updatedAt: Date.now(),
      });
    });

    // Link p1 and p3 to event
    await t.run(async (ctx) => {
      await ctx.db.insert('eventProducts', {
        eventId,
        productId: p1,
        status: 'available',
      });
      await ctx.db.insert('eventProducts', {
        eventId,
        productId: p3,
        status: 'available',
      });
    });

    // User should have 1 product in event (p1)
    const count = await t
      .withIdentity({ subject: userId })
      .query(api.events.getMyProductCountForEvent, { eventId });
    expect(count).toBe(1);

    // Link p2 to event
    await t.run(async (ctx) => {
      await ctx.db.insert('eventProducts', {
        eventId,
        productId: p2,
        status: 'available',
      });
    });

    // User should have 2 products now
    const count2 = await t
      .withIdentity({ subject: userId })
      .query(api.events.getMyProductCountForEvent, { eventId });
    expect(count2).toBe(2);
  });

  test('leaveEvent works even if no eventSeller record exists', async () => {
    const t = convexTest(schema);
    const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'P' }));
    const organizerId = await t.run((ctx) => ctx.db.insert('users', { name: 'O' }));
    const now = Date.now();
    const eventId = await t
      .withIdentity({ subject: organizerId })
      .mutation(api.events.createEvent, {
        title: 'No Seller Record',
        description: '',
        location: '',
        startDate: now + 60_000,
        endDate: now + 120_000,
        categories: [],
        services: [],
        contactInfo: '',
        commission: 0,
        visibility: 'public',
      });

    await t.run((ctx) =>
      ctx.db.insert('eventRole', { event: eventId, user: userId, roles: 'seller' })
    );

    // Should NOT throw
    await t.withIdentity({ subject: userId }).mutation(api.events.leaveEvent, { eventId });

    const roles = await t.run((ctx) =>
      ctx.db
        .query('eventRole')
        .withIndex('by_user_role', (q) => q.eq('user', userId).eq('roles', 'seller'))
        .collect()
    );
    expect(roles).toHaveLength(0);
  });

  test('getMyEvents filters out null events', async () => {
    const t = convexTest(schema);
    const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'U' }));
    const eventId = await t.run((ctx) =>
      ctx.db.insert('events', {
        title: 'T',
        organizerId: userId,
        commission: 0,
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        contactInfo: '',
        services: [],
        visibility: 'public',
      })
    );
    await t.run((ctx) =>
      ctx.db.insert('eventRole', { event: eventId, user: userId, roles: 'organizer' })
    );

    // Create another role for a non-existent event
    const fakeEventId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('events', {
        title: 'Fake',
        organizerId: userId,
        commission: 0,
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        contactInfo: '',
        services: [],
        visibility: 'public',
      });
      await ctx.db.delete(id);
      return id;
    });
    await t.run((ctx) =>
      ctx.db.insert('eventRole', { event: fakeEventId, user: userId, roles: 'organizer' })
    );

    const events = await t.withIdentity({ subject: userId }).query(api.events.getMyEvents, {});
    expect(events).toHaveLength(1);
    expect(events[0]._id).toBe(eventId);
  });

  test('deleteEvent fails for events in the past', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Admin',
        email: 'admin@past.com',
        systemRole: 'admin',
      });
    });

    const eventId = await t.run(async (ctx) => {
      return await ctx.db.insert('events', {
        title: 'Past Event',
        organizerId: userId,
        commission: 0,
        description: '',
        location: '',
        startDate: 1000,
        endDate: 2000, // In the past
        categories: [],
        contactInfo: '',
        services: [],
        visibility: 'public',
      });
    });

    await expect(
      t.withIdentity({ subject: userId }).mutation(api.events.deleteEvent, { id: eventId })
    ).rejects.toThrow('Vergangene Veranstaltungen können nicht gelöscht werden.');
  });

  test('admin functions throw for non-admin users', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'User', email: 'u@e.com' });
    });

    await expect(
      t.withIdentity({ subject: userId }).query(api.events.getEventsForAdmin)
    ).rejects.toThrow('Not authorized');
    await expect(
      t.withIdentity({ subject: userId }).query(api.events.getPublicEventsForAdmin)
    ).rejects.toThrow('Not authorized');

    const eventId = await t.run(async (ctx) => {
      return await ctx.db.insert('events', {
        title: 'T',
        organizerId: userId,
        commission: 0,
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        contactInfo: '',
        services: [],
        visibility: 'public',
      });
    });

    await expect(
      t.withIdentity({ subject: userId }).mutation(api.events.approveEventForAdmin, { eventId })
    ).rejects.toThrow('Not authorized');
    await expect(
      t.withIdentity({ subject: userId }).mutation(api.events.rejectEventForAdmin, {
        eventId,
        reason: 'R',
      })
    ).rejects.toThrow('Not authorized');
  });

  test('getEventsForAdmin returns enriched events with various approval states', async () => {
    const t = convexTest(schema);
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Admin',
        email: 'admin-final@e.com',
        systemRole: 'admin',
      });
    });
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'org-final@e.com' });
    });

    await t.run(async (ctx) => {
      // Pending
      await ctx.db.insert('events', {
        title: 'Pending',
        organizerId,
        visibility: 'public',
        commission: 0,
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        contactInfo: '',
        services: [],
        approvalStatus: 'pending',
      });
      // Approved
      await ctx.db.insert('events', {
        title: 'Approved',
        organizerId,
        visibility: 'logged-in',
        commission: 0,
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        contactInfo: '',
        services: [],
        approvalStatus: 'approved',
      });
    });

    const events = await t.withIdentity({ subject: adminId }).query(api.events.getEventsForAdmin);
    expect(events).toHaveLength(2);
    expect(events.find((e) => e.title === 'Pending')?.approvalStatus).toBe('pending');
    expect(events.find((e) => e.title === 'Approved')?.approvalStatus).toBe('approved');
  });

  test('getPublicEventsForAdmin returns enriched events', async () => {
    const t = convexTest(schema);
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Admin',
        email: 'admin@e.com',
        systemRole: 'admin',
      });
    });
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Organizer', email: 'o@e.com' });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert('events', {
        title: 'Public',
        organizerId,
        visibility: 'public',
        commission: 0,
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        contactInfo: '',
        services: [],
      });
      await ctx.db.insert('events', {
        title: 'Private',
        organizerId,
        visibility: 'logged-in',
        commission: 0,
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        contactInfo: '',
        services: [],
      });
    });

    const events = await t
      .withIdentity({ subject: adminId })
      .query(api.events.getPublicEventsForAdmin);
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Public');
    expect(events[0].organizerName).toBe('Organizer');
  });

  test('Admin can approve and reject events', async () => {
    const t = convexTest(schema);
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Admin',
        email: 'admin-action@e.com',
        systemRole: 'admin',
      });
    });
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'org-action@e.com' });
    });

    const eventId = await t.run(async (ctx) => {
      return await ctx.db.insert('events', {
        title: 'Action Event',
        organizerId,
        visibility: 'public',
        commission: 0,
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        contactInfo: '',
        services: [],
      });
    });

    // Approve
    await t
      .withIdentity({ subject: adminId })
      .mutation(api.events.approveEventForAdmin, { eventId });
    let event = await t.run(async (ctx) => ctx.db.get(eventId));
    expect(event?.isApproved).toBe(true);
    expect(event?.approvalStatus).toBe('approved');

    // Reject
    await t.withIdentity({ subject: adminId }).mutation(api.events.rejectEventForAdmin, {
      eventId,
      reason: 'No good',
    });
    event = await t.run(async (ctx) => ctx.db.get(eventId));
    expect(event?.isApproved).toBe(false);
    expect(event?.approvalStatus).toBe('rejected');
    expect(event?.rejectionReason).toBe('No good');

    // Reject with empty reason should fail
    await expect(
      t.withIdentity({ subject: adminId }).mutation(api.events.rejectEventForAdmin, {
        eventId,
        reason: ' ',
      })
    ).rejects.toThrow('Rejection reason is required');
  });

  test('requestEventReviewForOrganizer validation', async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'org-v@e.com' });
    });

    const eventId = await t.run(async (ctx) => {
      return await ctx.db.insert('events', {
        title: 'Logged-in Event',
        organizerId: userId,
        visibility: 'logged-in',
        commission: 0,
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        contactInfo: '',
        services: [],
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert('eventRole', { event: eventId, user: userId, roles: 'organizer' });
    });

    await expect(
      t.withIdentity({ subject: userId }).mutation(api.events.requestEventReviewForOrganizer, {
        eventId,
      })
    ).rejects.toThrow('Event is not public');
  });

  test('getEvent access control for unapproved public events', async () => {
    const t = convexTest(schema);
    const organizerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Org', email: 'org-acc@e.com' });
    });
    const sellerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Seller', email: 'seller-acc@e.com' });
    });
    const visitorId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Visitor', email: 'visitor-acc@e.com' });
    });

    const eventId = await t.run(async (ctx) => {
      return await ctx.db.insert('events', {
        title: 'Unapproved Public',
        organizerId,
        visibility: 'public',
        isApproved: false,
        commission: 0,
        description: '',
        location: '',
        startDate: Date.now() + 1000000,
        endDate: Date.now() + 2000000,
        categories: [],
        contactInfo: '',
        services: [],
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' });
      await ctx.db.insert('eventRole', { event: eventId, user: sellerId, roles: 'seller' });
    });

    // Visitor should not see it
    expect(await t.query(api.events.getEvent, { id: eventId })).toBeNull();
    expect(
      await t.withIdentity({ subject: visitorId }).query(api.events.getEvent, { id: eventId })
    ).toBeNull();

    // Organizer and Seller should see it
    expect(
      await t.withIdentity({ subject: organizerId }).query(api.events.getEvent, { id: eventId })
    ).not.toBeNull();
    expect(
      await t.withIdentity({ subject: sellerId }).query(api.events.getEvent, { id: eventId })
    ).not.toBeNull();
  });
});
