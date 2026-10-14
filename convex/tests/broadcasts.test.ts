import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api } from '../_generated/api';
import type { Id } from '../_generated/dataModel';

const HOUR = 60 * 60 * 1000;

/** Anna has an accepted item, Ben only announced ones and is paid out, Erika is a walk-in. */
async function setup() {
  const t = convexTest(schema);
  const ids = await t.run(async (ctx) => {
    const organizerId = await ctx.db.insert('users', { name: 'Orga', email: 'orga@test.de' });
    const helperId = await ctx.db.insert('users', { name: 'Helfer', email: 'helfer@test.de' });
    const anna = await ctx.db.insert('users', { name: 'Anna', email: 'anna@test.de' });
    const ben = await ctx.db.insert('users', { name: 'Ben', email: 'ben@test.de' });
    const categoryId = await ctx.db.insert('categories', { label: 'Räder', updatedAt: Date.now() });
    const eventId = await ctx.db.insert('events', {
      title: 'Fahrradbörse',
      description: '',
      location: 'Hof',
      startDate: Date.now() + 24 * HOUR,
      endDate: Date.now() + 30 * HOUR,
      contactInfo: '',
      categories: [categoryId],
      services: [],
      visibility: 'public',
      approvalStatus: 'approved',
      commission: 10,
      organizerId,
    });
    const erika = await ctx.db.insert('users', {
      name: 'Erika Muster',
      contactEmail: 'erika@test.de',
      managedByEventId: eventId,
    });
    await ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' });
    await ctx.db.insert('eventRole', { event: eventId, user: helperId, roles: 'coorganizer' });
    for (const user of [anna, ben, erika]) {
      await ctx.db.insert('eventRole', { event: eventId, user, roles: 'seller' });
    }
    const item = async (vendorId: Id<'users'>, status: 'announced' | 'available') => {
      const productId = await ctx.db.insert('products', {
        title: 'Rad',
        vendorId,
        description: '',
        condition: 'good',
        images: [],
        productCategory: categoryId,
        price: 50,
        readyForSale: true,
        sold: false,
        updatedAt: Date.now(),
      });
      await ctx.db.insert('eventProducts', { eventId, productId, status });
    };
    await item(anna, 'available');
    await item(ben, 'announced');
    await ctx.db.insert('eventSeller', {
      event: eventId,
      user: ben,
      totalFee: 0,
      comissionFee: 0,
      numberpayoutAmount: 0,
      payoutReceived: true,
    });
    return { organizerId, helperId, anna, ben, erika, eventId };
  });
  const asOrganizer = t.withIdentity({ subject: ids.organizerId });
  const send = (
    extra: Partial<{
      subject: string;
      body: string;
      audience: 'all' | 'accepted' | 'unsettled';
      important: boolean;
    }> = {}
  ) =>
    asOrganizer.mutation(api.broadcasts.sendSellerBroadcast, {
      eventId: ids.eventId,
      subject: 'Abgabe erst ab 9 Uhr',
      body: 'Wegen eines Aufbaus beginnt die Abgabe erst um 9 Uhr.\n\nInfos: https://verein.de/basar',
      audience: 'all',
      important: false,
      ...extra,
    });
  const mails = async () => {
    const jobs = await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
    return jobs.map((job) => ({
      ...(job.args[0] as {
        to: string;
        subject: string;
        paragraphs: string[];
        unsubscribe?: object;
      }),
      at: job.scheduledTime,
    }));
  };
  return { t, ...ids, asOrganizer, send, mails };
}

describe('seller broadcasts', () => {
  test('goes to all sellers incl. walk-ins, one after the other, as plain text', async () => {
    const s = await setup();
    expect(await s.send()).toBe(3);
    const sent = await s.mails();
    expect(sent.map((mail) => mail.to).sort()).toEqual([
      'anna@test.de',
      'ben@test.de',
      'erika@test.de',
    ]);
    expect(new Set(sent.map((mail) => mail.at)).size).toBe(3);
    expect(sent[0].subject).toBe('Abgabe erst ab 9 Uhr – Fahrradbörse');
    expect(sent[0].paragraphs).toEqual([
      'Nachricht vom Veranstalter von „Fahrradbörse“:',
      'Wegen eines Aufbaus beginnt die Abgabe erst um 9 Uhr.',
      'Infos: https://verein.de/basar',
    ]);
    expect(sent[0].unsubscribe).toBeDefined();
  });

  test('audiences: accepted items or not yet paid out', async () => {
    const s = await setup();
    const preview = (audience: 'accepted' | 'unsettled') =>
      s.asOrganizer.query(api.broadcasts.getBroadcastPreview, { eventId: s.eventId, audience });
    expect(await preview('accepted')).toMatchObject({ recipients: 1, left: 5, importantLeft: 1 });
    expect((await preview('unsettled')).recipients).toBe(2);
    await s.send({ audience: 'unsettled' });
    expect((await s.mails()).map((mail) => mail.to).sort()).toEqual([
      'anna@test.de',
      'erika@test.de',
    ]);
  });

  test('respects the email settings unless important', async () => {
    const s = await setup();
    await s.t.run((ctx) => ctx.db.patch(s.anna, { notificationPrefs: { organizer: false } }));
    await s.send();
    expect((await s.mails()).map((mail) => mail.to)).not.toContain('anna@test.de');

    await s.send({ important: true, subject: 'Parkplatz gesperrt' });
    const important = (await s.mails()).filter((mail) => mail.subject.startsWith('Wichtig:'));
    expect(important.map((mail) => mail.to)).toContain('anna@test.de');
    expect(important[0].unsubscribe).toBeUndefined();
  });

  test('limits: 5 per day, 1 important per day; text length', async () => {
    const s = await setup();
    await s.send({ important: true });
    await expect(s.send({ important: true })).rejects.toThrow('schon eine wichtige');
    for (let i = 0; i < 4; i++) await s.send();
    await expect(s.send()).rejects.toThrow('Höchstens 5 Nachrichten pro Tag');
    // A day later it works again
    await s.t.run(async (ctx) => {
      for (const broadcast of await ctx.db.query('eventBroadcasts').collect()) {
        await ctx.db.patch(broadcast._id, { createdAt: broadcast.createdAt - 25 * HOUR });
      }
    });
    await s.send();

    await expect(s.send({ subject: 'Hi' })).rejects.toThrow('Betreff');
    await expect(s.send({ body: 'kurz' })).rejects.toThrow('Nachricht braucht');
  });

  test('only the organizer sends; helpers see the log, sellers their messages', async () => {
    const s = await setup();
    await expect(
      s.t.withIdentity({ subject: s.helperId }).mutation(api.broadcasts.sendSellerBroadcast, {
        eventId: s.eventId,
        subject: 'Hallo',
        body: 'Eine Nachricht vom Helfer.',
        audience: 'all',
        important: false,
      })
    ).rejects.toThrow('Not authorized');
    await s.send({ audience: 'accepted', subject: 'Nur für Anna' });
    await s.send({ subject: 'Für alle' });

    const log = await s.t
      .withIdentity({ subject: s.helperId })
      .query(api.broadcasts.listEventBroadcasts, { eventId: s.eventId });
    expect(log.map((b) => [b.subject, b.recipientCount, b.audience])).toEqual([
      ['Für alle', 3, 'all'],
      ['Nur für Anna', 1, 'accepted'],
    ]);
    const forBen = await s.t
      .withIdentity({ subject: s.ben })
      .query(api.broadcasts.listEventBroadcasts, { eventId: s.eventId });
    expect(forBen.map((b) => b.subject)).toEqual(['Für alle']);
    expect(forBen[0].recipientCount).toBeUndefined();
    expect(await s.t.query(api.broadcasts.listEventBroadcasts, { eventId: s.eventId })).toEqual([]);
  });

  test('nothing to send without recipients', async () => {
    const s = await setup();
    await s.t.run(async (ctx) => {
      for (const row of await ctx.db.query('eventSeller').collect()) await ctx.db.delete(row._id);
      for (const relation of await ctx.db.query('eventProducts').collect()) {
        await ctx.db.patch(relation._id, { status: 'announced' });
      }
    });
    await expect(s.send({ audience: 'accepted' })).rejects.toThrow('Keine Verkäufer');
  });
});
