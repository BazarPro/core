import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api, internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';

type TestConvex = ReturnType<typeof convexTest>;

async function insertUser(
  t: TestConvex,
  fields: { email?: string; systemRole?: 'admin' | 'user'; status?: 'active' | 'inactive' }
) {
  return await t.run((ctx) => ctx.db.insert('users', { name: 'Test', ...fields }));
}

async function createEvent(
  t: TestConvex,
  userId: Id<'users'>,
  visibility: 'public' | 'logged-in' = 'public'
) {
  const organizer = t.withIdentity({ subject: userId });
  const category = await t.run((ctx) =>
    ctx.db.insert('categories', { label: 'Räder', updatedAt: Date.now() })
  );
  return await organizer.mutation(api.events.createEvent, {
    title: 'Fahrradbörse <Ulm>',
    description: 'Gebrauchte Räder',
    location: 'Münsterplatz',
    startDate: Date.now() + 1_000_000,
    endDate: Date.now() + 2_000_000,
    categories: [category],
    services: [],
    contactInfo: 'orga@test.de',
    commission: 10,
    visibility,
  });
}

async function scheduledNotifications(t: TestConvex) {
  const scheduled = await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
  return scheduled.filter((job) => job.name.includes('notifyAdminsEventPending'));
}

describe('admin notifications for pending events', () => {
  test('creating a public event schedules the admin email', async () => {
    const t = convexTest(schema);
    const organizerId = await insertUser(t, { email: 'orga@test.de' });
    const eventId = await createEvent(t, organizerId);

    const jobs = await scheduledNotifications(t);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].args[0]).toEqual({ eventId, triggeredBy: organizerId });
  });

  test('events that need no approval do not notify', async () => {
    const t = convexTest(schema);
    const organizerId = await insertUser(t, { email: 'orga@test.de' });
    await createEvent(t, organizerId, 'logged-in');

    expect(await scheduledNotifications(t)).toHaveLength(0);
  });

  test('countPendingApprovals counts for admins only', async () => {
    const t = convexTest(schema);
    const organizerId = await insertUser(t, { email: 'orga@test.de' });
    const adminId = await insertUser(t, { email: 'admin@test.de', systemRole: 'admin' });
    await createEvent(t, organizerId);
    await createEvent(t, organizerId, 'logged-in');

    const asAdmin = t.withIdentity({ subject: adminId });
    const asOrganizer = t.withIdentity({ subject: organizerId });
    expect(await asAdmin.query(api.events.countPendingApprovals, {})).toBe(1);
    expect(await asOrganizer.query(api.events.countPendingApprovals, {})).toBe(0);
    expect(await t.query(api.events.countPendingApprovals, {})).toBe(0);
  });

  test('the notice goes to active admins except the one who triggered it', async () => {
    const t = convexTest(schema);
    const organizerId = await insertUser(t, { email: 'orga@test.de' });
    await insertUser(t, { email: 'admin1@test.de', systemRole: 'admin', status: 'active' });
    const triggeringAdmin = await insertUser(t, { email: 'admin2@test.de', systemRole: 'admin' });
    await insertUser(t, { email: 'inactive@test.de', systemRole: 'admin', status: 'inactive' });
    await insertUser(t, { systemRole: 'admin' });
    const eventId = await createEvent(t, organizerId);

    const notice = await t.query(internal.events.getPendingApprovalNotice, {
      eventId,
      triggeredBy: triggeringAdmin,
    });
    expect(notice).toMatchObject({
      title: 'Fahrradbörse <Ulm>',
      location: 'Münsterplatz',
      organizerName: 'Test',
      recipients: ['admin1@test.de'],
    });
  });

  test('no notice once the event is no longer pending', async () => {
    const t = convexTest(schema);
    const organizerId = await insertUser(t, { email: 'orga@test.de' });
    const eventId = await createEvent(t, organizerId);
    await t.run((ctx) => ctx.db.patch(eventId, { approvalStatus: 'approved', isApproved: true }));

    expect(
      await t.query(internal.events.getPendingApprovalNotice, {
        eventId,
        triggeredBy: organizerId,
      })
    ).toBeNull();
  });
});
