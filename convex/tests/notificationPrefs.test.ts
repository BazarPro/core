import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api } from '../_generated/api';
import type { MutationCtx } from '../_generated/server';
import { notifyUser, type NotificationContent } from '../notifications';

const SOLD: NotificationContent = {
  subject: 'Verkauft: Jacke',
  heading: 'Verkauft',
  paragraphs: ['Deine Jacke ist verkauft.'],
  category: 'sales',
};
const ACCOUNT: NotificationContent = {
  subject: 'Dein Konto',
  heading: 'Konto',
  paragraphs: ['Wichtig.'],
};

async function setup() {
  const t = convexTest(schema);
  const userId = await t.run((ctx) =>
    ctx.db.insert('users', { name: 'Anna', email: 'anna@test.de' })
  );
  const send = (content: NotificationContent) =>
    t.run((ctx) => notifyUser(ctx as unknown as MutationCtx, userId, content, 'sales'));
  const mails = async () => {
    const scheduled = await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
    return scheduled.map(
      (job) => job.args[0] as { subject: string; unsubscribe?: { path: string } }
    );
  };
  return { t, userId, send, mails, asUser: t.withIdentity({ subject: userId }) };
}

describe('notification settings', () => {
  test('all categories are on by default and the mail carries an unsubscribe link', async () => {
    const s = await setup();
    expect(await s.asUser.query(api.notifications.getMyNotificationPrefs, {})).toEqual({
      sales: true,
      offers: true,
      questions: true,
      buyer: true,
      reminders: true,
      organizer: true,
    });
    await s.send(SOLD);
    const [mail] = await s.mails();
    expect(mail.unsubscribe?.path).toMatch(
      /^\/benachrichtigungen\/abbestellen\?t=[0-9a-f]{32}&k=sales$/
    );

    // Always-sent mails have no unsubscribe link
    await s.send(ACCOUNT);
    expect((await s.mails())[1].unsubscribe).toBeUndefined();
  });

  test('a switched-off category sends no mail, but the menu marker stays', async () => {
    const s = await setup();
    await s.asUser.mutation(api.notifications.updateMyNotificationPrefs, {
      prefs: { sales: false },
    });
    await s.send(SOLD);
    await s.send(ACCOUNT);
    expect((await s.mails()).map((mail) => mail.subject)).toEqual(['Dein Konto']);
    expect(await s.asUser.query(api.notifications.getUnreadNoticeCounts, {})).toMatchObject({
      sales: 2,
    });
    // Other switches keep their value
    await s.asUser.mutation(api.notifications.updateMyNotificationPrefs, {
      prefs: { offers: false },
    });
    const prefs = await s.asUser.query(api.notifications.getMyNotificationPrefs, {});
    expect(prefs).toMatchObject({ sales: false, offers: false, buyer: true });
  });

  test('the link from the mail unsubscribes without login', async () => {
    const s = await setup();
    await s.send(SOLD);
    const token = new URLSearchParams((await s.mails())[0].unsubscribe!.path.split('?')[1]).get(
      't'
    )!;
    expect(
      await s.t.query(api.notifications.getUnsubscribeInfo, { token, category: 'sales' })
    ).toEqual({ category: 'Verkäufe', subscribed: true });

    await s.t.mutation(api.notifications.unsubscribe, { token, category: 'sales' });
    expect(
      await s.t.query(api.notifications.getUnsubscribeInfo, { token, category: 'sales' })
    ).toEqual({ category: 'Verkäufe', subscribed: false });
    // The token stays the same for later mails
    await s.send({ ...SOLD, category: 'offers' });
    expect((await s.mails())[1].unsubscribe?.path).toContain(`t=${token}`);

    expect(
      await s.t.query(api.notifications.getUnsubscribeInfo, { token: 'x', category: 'sales' })
    ).toBeNull();
    await expect(
      s.t.mutation(api.notifications.unsubscribe, { token: 'f'.repeat(32), category: 'sales' })
    ).rejects.toThrow('ungültig');
  });

  test('settings need a login', async () => {
    const s = await setup();
    expect(await s.t.query(api.notifications.getMyNotificationPrefs, {})).toBeNull();
    await expect(
      s.t.mutation(api.notifications.updateMyNotificationPrefs, { prefs: { sales: false } })
    ).rejects.toThrow('Not authenticated');
  });
});
