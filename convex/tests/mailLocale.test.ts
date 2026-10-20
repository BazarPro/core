import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import type { MutationCtx } from '../_generated/server';
import { internal } from '../_generated/api';
import type { Locale } from '../constants';
import { notifyAddress, notifyUser, type LocalizedContent } from '../notifications';
import { formatBerlinRange } from '../berlinTime';
import { mailT } from '../i18n';
import { dayBeforeInfo, pickupReminder } from '../reminderContent';

const SOLD: LocalizedContent = (t) => ({
  subject: t('sale.one.subject', { title: 'Jacke' }),
  heading: t('sale.one.heading'),
  paragraphs: [t('sale.one.text', { title: 'Jacke', event: 'Kinderbasar' })],
  category: 'sales',
});

interface ScheduledMail {
  subject: string;
  heading: string;
  locale?: Locale;
  unsubscribe?: { category: string };
}

async function setup(locale?: Locale) {
  const t = convexTest(schema);
  const userId = await t.run((ctx) =>
    ctx.db.insert('users', { name: 'Anna', email: 'anna@test.de', locale })
  );
  const mails = async () => {
    const scheduled = await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
    return scheduled.map((job) => job.args[0] as ScheduledMail);
  };
  return { t, userId, mails };
}

describe('emails in the language of the recipient', () => {
  test('a user who chose English gets the mail in English', async () => {
    const s = await setup('en');
    await s.t.run((ctx) => notifyUser(ctx as unknown as MutationCtx, s.userId, SOLD));
    const [mail] = await s.mails();
    expect(mail.subject).toBe('Sold: Jacke');
    expect(mail.heading).toBe('Your item was sold');
    expect(mail.locale).toBe('en');
    expect(mail.unsubscribe?.category).toBe('Sales');
  });

  test('accounts without a language and plain addresses get German', async () => {
    const s = await setup();
    await s.t.run(async (ctx) => {
      await notifyUser(ctx as unknown as MutationCtx, s.userId, SOLD);
      await notifyAddress(ctx as unknown as MutationCtx, 'buyer@test.de', SOLD);
    });
    const mails = await s.mails();
    expect(mails.map((mail) => [mail.subject, mail.locale])).toEqual([
      ['Verkauft: Jacke', 'de'],
      ['Verkauft: Jacke', 'de'],
    ]);
    expect(mails[0].unsubscribe?.category).toBe('Verkäufe');
  });

  test('the verification email follows the language stored at sign-up', async () => {
    const s = await setup('en');
    expect(await s.t.query(internal.users.getLocaleByEmail, { email: 'anna@test.de' })).toBe('en');
    expect(await s.t.query(internal.users.getLocaleByEmail, { email: 'new@test.de' })).toBe('de');
  });
});

describe('English mail texts', () => {
  const event = {
    _id: 'e',
    title: 'Kids bazaar',
    location: 'Hall',
    startDate: Date.UTC(2026, 9, 17, 7),
    endDate: Date.UTC(2026, 9, 17, 11),
    contactInfo: 'info@example.org',
    sellerLogistics: {
      pickupStart: Date.UTC(2026, 9, 17, 14),
      pickupEnd: Date.UTC(2026, 9, 17, 15),
    },
  };

  test('dates are written in English', () => {
    expect(formatBerlinRange(event.startDate, event.endDate, 'en')).toBe(
      'Saturday, 17 October 2026, 9:00–13:00'
    );
    expect(formatBerlinRange(event.startDate, Date.UTC(2026, 9, 18, 7), 'en')).toBe(
      'Saturday, 17 October 2026, 9:00 until Sunday, 18 October 2026, 9:00'
    );
  });

  test('reminders use plural forms and the English date', () => {
    const t = mailT('en');
    const info = dayBeforeInfo(event, { itemCount: 1 }, t);
    expect(info.subject).toBe('Almost time: Kids bazaar');
    expect(info.paragraphs[0]).toMatch(/^You registered 1 item\./);

    const pickup = pickupReminder(event, { soldCount: 2, payout: 10, unsoldTitles: ['Bike'] }, t);
    expect(pickup.paragraphs).toContain('“Kids bazaar” is over. You sold 2 items.');
    expect(pickup.paragraphs).toContain('Pickup: Saturday, 17 October 2026, 16:00–17:00, Hall.');
    expect(pickup.details).toContainEqual({ label: 'To pick up', value: '1 item' });
  });
});
