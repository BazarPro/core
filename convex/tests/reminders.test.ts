import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api, internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { pickupReminder } from '../reminderContent';

const HOUR = 60 * 60 * 1000;

async function addItem(
  ctx: MutationCtx,
  eventId: Id<'events'>,
  categoryId: Id<'categories'>,
  vendorId: Id<'users'>,
  title: string,
  status: Doc<'eventProducts'>['status']
) {
  const productId = await ctx.db.insert('products', {
    title,
    vendorId,
    description: '',
    condition: 'good',
    images: [],
    productCategory: categoryId,
    price: 50,
    readyForSale: true,
    sold: status === 'sold',
    updatedAt: Date.now(),
  });
  await ctx.db.insert('eventProducts', { eventId, productId, status });
  if (status === 'sold') {
    await ctx.db.insert('purchase', {
      product: productId,
      event: eventId,
      seller: vendorId,
      totalAmount: 50,
      comissionAmount: 5,
      payoutAmount: 45,
      payoutStatus: false,
      payoutDate: 0,
    });
  }
}

/**
 * Anna: 2 registered items (1 handed in, 1 sold), Nr. 7. Ben: nothing registered.
 * Cleo: everything paid out. Dora: registered, never handed in.
 */
async function setup(startIn = 1 * HOUR) {
  const t = convexTest(schema);
  const ids = await t.run(async (ctx) => {
    const organizerId = await ctx.db.insert('users', { name: 'Orga', email: 'orga@test.de' });
    const [anna, ben, cleo, dora] = await Promise.all(
      ['anna', 'ben', 'cleo', 'dora'].map((name) =>
        ctx.db.insert('users', { name, email: `${name}@test.de` })
      )
    );
    const categoryId = await ctx.db.insert('categories', { label: 'Räder', updatedAt: Date.now() });
    const eventId = await ctx.db.insert('events', {
      title: 'Fahrradbörse',
      description: '',
      location: 'Schulhof',
      startDate: Date.now() + startIn,
      endDate: Date.now() + startIn + 6 * HOUR,
      contactInfo: 'orga@verein.de',
      categories: [categoryId],
      services: [],
      visibility: 'public',
      approvalStatus: 'approved',
      commission: 10,
      organizerId,
      sellerLogistics: { note: 'Bitte Räder mit Schloss abgeben.' },
    });
    for (const user of [anna, ben, cleo, dora]) {
      await ctx.db.insert('eventRole', { event: eventId, user, roles: 'seller' });
    }
    await ctx.db.insert('eventSeller', {
      event: eventId,
      user: anna,
      totalFee: 0,
      comissionFee: 0,
      numberpayoutAmount: 0,
      payoutReceived: false,
      number: 7,
    });
    await ctx.db.insert('eventSeller', {
      event: eventId,
      user: cleo,
      totalFee: 0,
      comissionFee: 0,
      numberpayoutAmount: 0,
      payoutReceived: true,
    });
    const item = (vendorId: Id<'users'>, title: string, status: Doc<'eventProducts'>['status']) =>
      addItem(ctx, eventId, categoryId, vendorId, title, status);
    await item(anna, 'Kinderrad', 'available');
    await item(anna, 'Laufrad', 'announced');
    await item(cleo, 'Roller', 'returned');
    await item(dora, 'Helm', 'announced');
    return { organizerId, anna, ben, cleo, dora, eventId, categoryId };
  });
  const mails = async () => {
    const jobs = await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
    return jobs
      .filter((job) => job.name.includes('sendNotification'))
      .map(
        (job) =>
          job.args[0] as {
            to: string;
            subject: string;
            paragraphs: string[];
            details: { label: string; value: string }[];
          }
      );
  };
  const jobs = async () =>
    (await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect())).map(
      (job) => job.name
    );
  return { t, ...ids, mails, jobs };
}

describe('seller reminders', () => {
  test('the evening before: only sellers with registered items, once', async () => {
    const s = await setup();
    expect(await s.t.mutation(internal.reminders.sendDayBeforeInfo, { eventId: s.eventId })).toBe(
      2
    );
    const sent = await s.mails();
    expect(sent.map((mail) => mail.to).sort()).toEqual(['anna@test.de', 'dora@test.de']);
    const anna = sent.find((mail) => mail.to === 'anna@test.de')!;
    expect(anna.subject).toBe('Bald ist es so weit: Fahrradbörse');
    expect(anna.details).toContainEqual({ label: 'Deine Nummer', value: '7' });
    expect(anna.details).toContainEqual({ label: 'Deine Artikel', value: '2' });
    expect(anna.paragraphs).toContain('Bitte Räder mit Schloss abgeben.');

    // Not twice, but again when the bazaar is moved
    expect(await s.t.mutation(internal.reminders.sendDayBeforeInfo, { eventId: s.eventId })).toBe(
      0
    );
    await s.t.run((ctx) => ctx.db.patch(s.eventId, { startDate: Date.now() + 2 * HOUR }));
    expect(await s.t.mutation(internal.reminders.sendDayBeforeInfo, { eventId: s.eventId })).toBe(
      2
    );
  });

  test('after the end: sellers not paid out who handed something in', async () => {
    const s = await setup();
    await s.t.run((ctx) =>
      addItem(ctx, s.eventId, s.categoryId, s.anna, 'Fahrradanhänger', 'sold')
    );
    expect(await s.t.mutation(internal.reminders.sendPickupReminder, { eventId: s.eventId })).toBe(
      1
    );
    const [mail] = await s.mails();
    expect(mail.to).toBe('anna@test.de');
    expect(mail.paragraphs).toContain('Abzuholen: Kinderrad.');
    expect(mail.details).toEqual([
      { label: 'Verkauft', value: '1 Artikel' },
      { label: 'Auszahlung', value: '45,00 €' },
      { label: 'Abzuholen', value: '1 Artikel' },
    ]);
    expect(await s.t.mutation(internal.reminders.sendPickupReminder, { eventId: s.eventId })).toBe(
      0
    );
  });

  test('the hourly job picks due bazaars only', async () => {
    const soon = await setup(1 * HOUR);
    await soon.t.mutation(internal.reminders.sendDueReminders, {});
    expect(await soon.jobs()).toEqual(['reminders:sendDayBeforeInfo']);

    // Starts in two days: the evening before has not come yet
    const later = await setup(47 * HOUR);
    await later.t.mutation(internal.reminders.sendDueReminders, {});
    expect(await later.jobs()).toEqual([]);

    // Ended an hour ago: pickup reminder; already sent: nothing
    const ended = await setup(-7 * HOUR);
    await ended.t.mutation(internal.reminders.sendDueReminders, {});
    expect(await ended.jobs()).toEqual(['reminders:sendPickupReminder']);
    const event = await ended.t.run((ctx) => ctx.db.get(ended.eventId));
    await ended.t.run((ctx) =>
      ctx.db.patch(ended.eventId, { remindersSent: { pickup: event!.endDate } })
    );
    await ended.t.run(async (ctx) => {
      for (const job of await ctx.db.system.query('_scheduled_functions').collect()) {
        await ctx.scheduler.cancel(job._id);
      }
    });
    await ended.t.mutation(internal.reminders.sendDueReminders, {});
    expect(
      (await ended.jobs()).filter((name) => name === 'reminders:sendPickupReminder')
    ).toHaveLength(1);
  });

  test('nothing for bazaars that are not approved', async () => {
    for (const approvalStatus of ['pending', 'rejected'] as const) {
      for (const startIn of [1 * HOUR, -7 * HOUR]) {
        const s = await setup(startIn);
        await s.t.run((ctx) => ctx.db.patch(s.eventId, { approvalStatus }));
        await s.t.mutation(internal.reminders.sendDueReminders, {});
        expect(await s.jobs()).toEqual([]);
      }
    }
  });

  test('a later pickup gets its reminder 2 hours before, not at the end', async () => {
    // Ended an hour ago, pickup only tomorrow morning: not yet
    const atEnd = await setup(-7 * HOUR);
    const tomorrow = Date.now() + 20 * HOUR;
    await atEnd.t.run((ctx) =>
      ctx.db.patch(atEnd.eventId, {
        sellerLogistics: { pickupStart: tomorrow, pickupEnd: tomorrow + 2 * HOUR },
      })
    );
    await atEnd.t.mutation(internal.reminders.sendDueReminders, {});
    expect(await atEnd.jobs()).toEqual([]);

    // Ended yesterday, pickup in 1.5 hours: now
    const before = await setup(-24 * HOUR);
    const soon = Date.now() + 1.5 * HOUR;
    await before.t.run((ctx) =>
      ctx.db.patch(before.eventId, {
        sellerLogistics: { pickupStart: soon, pickupEnd: soon + 2 * HOUR },
      })
    );
    await before.t.mutation(internal.reminders.sendDueReminders, {});
    expect(await before.jobs()).toEqual(['reminders:sendPickupReminder']);
  });

  test('no pickup reminder once the pickup is over', async () => {
    const s = await setup(-7 * HOUR);
    await s.t.run((ctx) =>
      ctx.db.patch(s.eventId, {
        sellerLogistics: { pickupStart: Date.now() - 3 * HOUR, pickupEnd: Date.now() - HOUR },
      })
    );
    await s.t.mutation(internal.reminders.sendDueReminders, {});
    expect(await s.jobs()).toEqual([]);
  });

  test('pickup text: fee to pay and long item lists', () => {
    const content = pickupReminder(
      {
        _id: 'e',
        title: 'Kinderbasar',
        location: 'Halle',
        startDate: 0,
        endDate: 0,
        contactInfo: '',
        sellerLogistics: {
          pickupStart: Date.UTC(2026, 9, 17, 14),
          pickupEnd: Date.UTC(2026, 9, 17, 15),
        },
      },
      {
        soldCount: 0,
        payout: -6,
        unsoldTitles: Array.from({ length: 12 }, (_, i) => `Teil ${i + 1}`),
      }
    );
    expect(content.details).toContainEqual({ label: 'Annahmegebühr zu zahlen', value: '6,00 €' });
    expect(content.paragraphs).toContain(
      'Abzuholen: Teil 1, Teil 2, Teil 3, Teil 4, Teil 5, Teil 6, Teil 7, Teil 8, Teil 9, Teil 10 und 2 weitere.'
    );
    expect(content.paragraphs).toContain(
      'Abholung: Samstag, 17. Oktober 2026, 16:00–17:00 Uhr, Halle.'
    );
  });
});

describe('hand-in and pickup times', () => {
  test('are validated and kept when an older client does not send them', async () => {
    const s = await setup(24 * HOUR);
    await s.t.run((ctx) =>
      ctx.db.insert('eventRole', { event: s.eventId, user: s.organizerId, roles: 'organizer' })
    );
    const asOrganizer = s.t.withIdentity({ subject: s.organizerId });
    const event = (await s.t.run((ctx) => ctx.db.get(s.eventId)))!;
    const edit = (sellerLogistics?: Doc<'events'>['sellerLogistics']) =>
      asOrganizer.mutation(api.events.editEvent, {
        id: s.eventId,
        title: event.title,
        description: '',
        location: event.location,
        startDate: event.startDate,
        endDate: event.endDate,
        contactInfo: event.contactInfo,
        categories: event.categories,
        services: [],
        visibility: 'public',
        commission: 10,
        ...(sellerLogistics ? { sellerLogistics } : {}),
      });
    await expect(edit({ dropoffStart: 2, dropoffEnd: 1 })).rejects.toThrow(
      'Ende der Abgabe muss nach dem Beginn'
    );
    await expect(edit({ pickupEnd: 1 })).rejects.toThrow('Beginn der Abholung');
    await expect(edit({ note: 'x'.repeat(2001) })).rejects.toThrow('höchstens 2000 Zeichen');

    await edit({ dropoffStart: 1, dropoffEnd: 2, note: '  Hof  ' });
    await edit();
    expect((await s.t.run((ctx) => ctx.db.get(s.eventId)))?.sellerLogistics).toEqual({
      dropoffStart: 1,
      dropoffEnd: 2,
      note: 'Hof',
    });
  });
});
