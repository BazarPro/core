import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api } from '../_generated/api';
import type { StoredEventFeatures } from '../eventFeatures';
import { pickupReminder } from '../reminderContent';
import { mailT } from '../i18n';

type TestConvex = ReturnType<typeof convexTest>;
const HOUR = 60 * 60 * 1000;

/** A running bike market where sellers take the money; one announced bike for 200 €. */
async function setup(t: TestConvex, features: StoredEventFeatures = { sellerCollects: true }) {
  const organizerId = await t.run((ctx) =>
    ctx.db.insert('users', { name: 'Orga', email: 'orga@test.de' })
  );
  const sellerId = await t.run((ctx) =>
    ctx.db.insert('users', { name: 'Anna', email: 'anna@test.de' })
  );
  const categoryId = await t.run((ctx) =>
    ctx.db.insert('categories', { label: 'Fahrräder', updatedAt: Date.now() })
  );
  const asOrganizer = t.withIdentity({ subject: organizerId });
  const asSeller = t.withIdentity({ subject: sellerId });
  const eventId = await asOrganizer.mutation(api.events.createEvent, {
    title: 'Fahrradmarkt',
    description: '',
    location: 'Münsterplatz',
    startDate: Date.now() - HOUR,
    endDate: Date.now() + 5 * HOUR,
    categories: [categoryId],
    services: [],
    contactInfo: 'orga@test.de',
    commission: 20,
    visibility: 'logged-in',
    features: { photosOptional: true, discounts: false, ...features },
  });
  const productId = await asSeller.mutation(api.products.addProduct, {
    title: 'Trekkingrad',
    vendorId: sellerId,
    description: '',
    condition: 'good',
    images: [],
    productCategory: categoryId,
    price: 200,
    readyForSale: true,
    sold: false,
  });
  const eventProductId = await t.run(async (ctx) => {
    await ctx.db.insert('eventRole', { event: eventId, user: sellerId, roles: 'seller' });
    await ctx.db.insert('eventSeller', {
      event: eventId,
      user: sellerId,
      totalFee: 0,
      comissionFee: 0,
      numberpayoutAmount: 0,
      payoutReceived: false,
      number: 1,
    });
    return await ctx.db.insert('eventProducts', { eventId, productId, status: 'announced' });
  });
  return { t, organizerId, sellerId, eventId, productId, eventProductId, asOrganizer, asSeller };
}

const purchases = (t: TestConvex) => t.run((ctx) => ctx.db.query('purchase').collect());

describe('sellers take the money themselves', () => {
  test('the desk reports a sale without intake; the seller owes the commission', async () => {
    const s = await setup(convexTest(schema));
    await s.asOrganizer.mutation(api.purchases.sellProduct, { eventProductId: s.eventProductId });

    const [purchase] = await purchases(s.t);
    expect(purchase).toMatchObject({
      totalAmount: 200,
      comissionAmount: 40,
      payoutAmount: -40,
      collectedBy: 'seller',
    });
    expect((await s.t.run((ctx) => ctx.db.get(s.eventProductId)))?.status).toBe('sold');

    const mails = await s.t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
    const saleMail = mails.find((job) => job.name.includes('sendNotification'))?.args[0] as {
      details: { label: string; value: string }[];
    };
    expect(saleMail.details).toContainEqual({
      label: 'An den Veranstalter zu zahlen',
      value: '40,00 €',
    });
  });

  test('the agreed price may be lower than on the label, not higher', async () => {
    const s = await setup(convexTest(schema));
    await expect(
      s.asOrganizer.mutation(api.purchases.sellProduct, {
        eventProductId: s.eventProductId,
        negotiatedPrice: 250,
      })
    ).rejects.toThrow('checkout.priceRange');
    await s.asOrganizer.mutation(api.purchases.sellProduct, {
      eventProductId: s.eventProductId,
      negotiatedPrice: 150,
    });
    expect((await purchases(s.t))[0]).toMatchObject({
      totalAmount: 150,
      payoutAmount: -30,
      priceSource: 'negotiated',
    });
  });

  test('sellers cannot record their own sales', async () => {
    const s = await setup(convexTest(schema));
    await expect(
      s.asSeller.mutation(api.purchases.sellProduct, { eventProductId: s.eventProductId })
    ).rejects.toThrow('auth.forbidden');
  });

  test('without the setting announced items still need the intake first', async () => {
    const s = await setup(convexTest(schema), {});
    await expect(
      s.asOrganizer.mutation(api.purchases.sellProduct, { eventProductId: s.eventProductId })
    ).rejects.toThrow('product.notForSale');
  });

  test('cash box and settlement: the commission is collected, only by the team', async () => {
    const s = await setup(convexTest(schema));
    await s.asOrganizer.mutation(api.purchases.sellProduct, { eventProductId: s.eventProductId });

    const summary = await s.asOrganizer.query(api.events.getEventFinancialSummary, {
      eventId: s.eventId,
    });
    expect(summary).toMatchObject({
      sellerCollects: true,
      totalNetRevenue: 200,
      totalCollectedBySellers: 200,
      totalFeesToCollect: 40,
      cashInHandSoll: 0,
    });
    expect(summary.sellersToCollect).toEqual([{ name: 'Anna', sellerNumber: 1, amount: 40 }]);

    const [group] = await s.asSeller.query(api.purchases.getMySales, {});
    expect(group.event.sellerCollects).toBe(true);
    expect(group.totals.payout).toBe(-40);

    await expect(
      s.asSeller.mutation(api.eventSeller.settleVendor, {
        eventId: s.eventId,
        vendorUserId: s.sellerId,
      })
    ).rejects.toThrow('seller.payoutStaffOnly');
    await s.asOrganizer.mutation(api.eventSeller.settleVendor, {
      eventId: s.eventId,
      vendorUserId: s.sellerId,
    });
    expect(
      await s.asOrganizer.query(api.events.getEventFinancialSummary, { eventId: s.eventId })
    ).toMatchObject({ totalFeesCollected: 40, totalFeesToCollect: 0, cashInHandSoll: 40 });
  });

  test('undoing the sale brings the item back as announced', async () => {
    const s = await setup(convexTest(schema));
    await s.t.run((ctx) =>
      ctx.db.insert('featureFlags', { key: 'allow_undo_inventory_actions', value: true })
    );
    await s.asOrganizer.mutation(api.purchases.sellProduct, { eventProductId: s.eventProductId });
    await s.asOrganizer.mutation(api.purchases.undoSale, { eventProductId: s.eventProductId });
    expect((await s.t.run((ctx) => ctx.db.get(s.eventProductId)))?.status).toBe('announced');
    expect(await purchases(s.t)).toEqual([]);
  });
});

describe('reminder after a market where sellers took the money', () => {
  test('asks for the commission instead of a pickup', () => {
    const content = pickupReminder(
      {
        _id: 'e',
        title: 'Fahrradmarkt',
        location: 'Münsterplatz',
        startDate: 0,
        endDate: 0,
        contactInfo: '',
        features: { sellerCollects: true },
      },
      { soldCount: 2, payout: -60, unsoldTitles: ['Kinderrad'] },
      mailT('de')
    );
    expect(content.subject).toBe('Provision offen: Fahrradmarkt');
    expect(content.paragraphs).toContain(
      'Du hast das Geld für deine Verkäufe selbst bekommen. Bitte zahle die Provision von 60,00 € am Infostand bzw. beim Veranstalter.'
    );
    expect(content.details).toContainEqual({ label: 'Provision zu zahlen', value: '60,00 €' });
  });
});
