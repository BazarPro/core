import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api, internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { createOrUpdateUser } from '../authUsers';

type TestConvex = ReturnType<typeof convexTest>;
const HOUR = 60 * 60 * 1000;

async function setup() {
  const t = convexTest(schema);
  const ids = await t.run(async (ctx) => ({
    adminId: await ctx.db.insert('users', {
      name: 'Vorstand',
      email: 'vorstand@verein.de',
      systemRole: 'admin',
      status: 'active',
    }),
    helperId: await ctx.db.insert('users', { name: 'Helfer', email: 'helfer@verein.de' }),
    userId: await ctx.db.insert('users', { name: 'Mitglied', email: 'mitglied@verein.de' }),
    categoryId: await ctx.db.insert('categories', { label: 'Kleidung', updatedAt: Date.now() }),
  }));
  return { t, ...ids, as: (id: Id<'users'>) => t.withIdentity({ subject: id }) };
}

function eventArgs(categoryId: Id<'categories'>, offsetHours: number, title = 'Herbstbasar') {
  return {
    title,
    description: 'Kinderkleidung',
    location: 'Gemeindehaus',
    startDate: Date.now() + offsetHours * HOUR,
    endDate: Date.now() + (offsetHours + 5) * HOUR,
    categories: [categoryId],
    services: [],
    contactInfo: 'vorstand@verein.de',
    commission: 10,
    visibility: 'public',
  };
}

async function scheduledJobs(t: TestConvex) {
  return await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
}

beforeEach(() => {
  vi.stubEnv('BAZARPRO_MODE', 'single');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('single mode: events', () => {
  test('only admins create events; public events need no approval', async () => {
    const { t, adminId, userId, categoryId, as } = await setup();
    await expect(
      as(userId).mutation(api.events.createEvent, eventArgs(categoryId, 24))
    ).rejects.toThrow('Nur Administratoren');

    const eventId = await as(adminId).mutation(api.events.createEvent, eventArgs(categoryId, 24));
    expect(await t.run((ctx) => ctx.db.get(eventId))).toMatchObject({
      visibility: 'public',
      approvalStatus: 'approved',
      isApproved: true,
    });
    const jobs = await scheduledJobs(t);
    expect(jobs.some((job) => job.name.includes('notifyAdminsEventPending'))).toBe(false);
  });

  test('admins see every event of the instance under "my events"', async () => {
    const { t, adminId, categoryId, as } = await setup();
    const otherAdmin = await t.run((ctx) =>
      ctx.db.insert('users', { name: 'Kasse', email: 'kasse@verein.de', systemRole: 'admin' })
    );
    await as(otherAdmin).mutation(api.events.createEvent, eventArgs(categoryId, 24));
    expect(await as(adminId).query(api.events.getMyEvents, {})).toHaveLength(1);
  });

  test('the start page leads to the running, else the next bazaar', async () => {
    const { t, adminId, categoryId, as } = await setup();
    expect(await t.query(api.instance.getCurrentEvent, {})).toBeNull();

    await as(adminId).mutation(api.events.createEvent, eventArgs(categoryId, 48, 'Frühjahr'));
    const next = await as(adminId).mutation(
      api.events.createEvent,
      eventArgs(categoryId, 24, 'Herbst')
    );
    expect(await t.query(api.instance.getCurrentEvent, {})).toMatchObject({ _id: next });

    const running = await t.run((ctx) =>
      ctx.db.insert('events', {
        ...eventArgs(categoryId, -1, 'Läuft'),
        visibility: 'public',
        services: [],
        organizerId: adminId,
        approvalStatus: 'approved',
      })
    );
    expect(await t.query(api.instance.getCurrentEvent, {})).toMatchObject({ _id: running });

    // Hidden by moderation: skipped
    await t.run((ctx) =>
      ctx.db.patch(running, {
        moderation: { hiddenAt: Date.now(), hiddenBy: adminId, reason: 'Test' },
      })
    );
    expect(await t.query(api.instance.getCurrentEvent, {})).toMatchObject({ _id: next });
  });
});

describe('single mode: access to the organizer area', () => {
  test('admins and the event team only; everybody on the platform', async () => {
    const { t, adminId, helperId, userId, categoryId, as } = await setup();
    const eventId = await as(adminId).mutation(api.events.createEvent, eventArgs(categoryId, 24));
    await t.run((ctx) =>
      ctx.db.insert('eventRole', { event: eventId, user: helperId, roles: 'coorganizer' })
    );

    expect(await as(adminId).query(api.instance.getMyAccess, {})).toEqual({
      canOrganize: true,
      canCreateEvents: true,
    });
    expect(await as(helperId).query(api.instance.getMyAccess, {})).toEqual({
      canOrganize: true,
      canCreateEvents: false,
    });
    expect(await as(userId).query(api.instance.getMyAccess, {})).toEqual({
      canOrganize: false,
      canCreateEvents: false,
    });

    vi.stubEnv('BAZARPRO_MODE', 'platform');
    expect(await as(userId).query(api.instance.getMyAccess, {})).toEqual({
      canOrganize: true,
      canCreateEvents: true,
    });
  });
});

describe('single mode: branding and first admin', () => {
  test('emails and pages use the association name', async () => {
    const { t, as, adminId } = await setup();
    expect((await t.query(api.instance.getConfig, {})).brand).toBe('Basar');
    await as(adminId).mutation(api.instance.updateSettings, { name: 'Kinderbasar Ulm' });
    expect((await t.query(api.instance.getConfig, {})).brand).toBe('Kinderbasar Ulm');
    vi.stubEnv('BAZARPRO_MODE', 'platform');
    expect((await t.query(api.instance.getConfig, {})).brand).toBe('BazarPro');
  });

  test('ADMIN_EMAIL becomes admin only with a verified address', async () => {
    vi.stubEnv('ADMIN_EMAIL', 'Chef@Verein.de');
    const t = convexTest(schema);
    const signUp = (type: 'credentials' | 'verification') =>
      t.run((ctx) =>
        createOrUpdateUser(ctx as unknown as MutationCtx, {
          existingUserId: null,
          type,
          profile: { email: 'chef@verein.de' },
        })
      );

    // Registration with password: not verified yet
    const userId = await signUp('credentials');
    expect((await t.run((ctx) => ctx.db.get(userId)))?.systemRole).toBe('user');
    // Found despite the different case in .env, but not verified yet
    expect(await t.mutation(internal.users.promoteConfiguredAdmin, {})).toContain('sobald');
    await t.run((ctx) => ctx.db.patch(userId, { isMailConfirmed: true }));
    expect(await t.mutation(internal.users.promoteConfiguredAdmin, {})).toContain(
      'ist Administrator'
    );
    await t.run((ctx) => ctx.db.patch(userId, { systemRole: 'user', isMailConfirmed: false }));

    // Entering the emailed code verifies the address
    await signUp('verification');
    expect((await t.run((ctx) => ctx.db.get(userId)))?.systemRole).toBe('admin');
  });

  test('init promotes an account that existed and was verified before ADMIN_EMAIL was set', async () => {
    const t = convexTest(schema);
    const userId = await t.run((ctx) =>
      ctx.db.insert('users', { name: 'Chef', email: 'chef@verein.de', isMailConfirmed: true })
    );
    expect(await t.mutation(internal.users.promoteConfiguredAdmin, {})).toContain('nicht gesetzt');
    vi.stubEnv('ADMIN_EMAIL', 'chef@verein.de');
    await t.mutation(internal.users.promoteConfiguredAdmin, {});
    expect((await t.run((ctx) => ctx.db.get(userId)))?.systemRole).toBe('admin');
  });
});
