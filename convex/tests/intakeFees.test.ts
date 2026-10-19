import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';

const HOUR = 60 * 60 * 1000;

/** Fahrradbörse with 3 € per bike: Anna brings 3 bikes (sells one for 100 €), Ben 2 (sells none). */
async function setup(intakeFee: number | undefined) {
  const t = convexTest(schema);
  const ids = await t.run(async (ctx) => {
    const organizerId = await ctx.db.insert('users', { name: 'Orga', email: 'orga@test.de' });
    const anna = await ctx.db.insert('users', { name: 'Anna', email: 'anna@test.de' });
    const ben = await ctx.db.insert('users', { name: 'Ben', email: 'ben@test.de' });
    const categoryId = await ctx.db.insert('categories', { label: 'Räder', updatedAt: Date.now() });
    const eventId = await ctx.db.insert('events', {
      title: 'Fahrradbörse',
      description: '',
      location: 'Hof',
      startDate: Date.now() - HOUR,
      endDate: Date.now() + HOUR,
      contactInfo: '',
      categories: [categoryId],
      services: [],
      visibility: 'public',
      approvalStatus: 'approved',
      commission: 10,
      organizerId,
      features: { intakeFee },
    });
    await ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' });
    const bring = async (
      vendorId: Id<'users'>,
      status: Doc<'eventProducts'>['status'],
      sold?: number
    ) => {
      const productId = await ctx.db.insert('products', {
        title: 'Rad',
        vendorId,
        description: '',
        condition: 'good',
        images: [],
        productCategory: categoryId,
        price: sold ?? 50,
        readyForSale: true,
        sold: sold !== undefined,
        updatedAt: Date.now(),
      });
      await ctx.db.insert('eventProducts', { eventId, productId, status });
      if (sold !== undefined) {
        await ctx.db.insert('purchase', {
          product: productId,
          event: eventId,
          seller: vendorId,
          totalAmount: sold,
          comissionAmount: sold * 0.1,
          payoutAmount: sold * 0.9,
          payoutStatus: false,
          payoutDate: 0,
        });
      }
    };
    for (const user of [anna, ben]) {
      await ctx.db.insert('eventRole', { event: eventId, user, roles: 'seller' });
    }
    await bring(anna, 'sold', 100);
    await bring(anna, 'available');
    await bring(anna, 'returned');
    // Only announced, never brought: no fee
    await bring(anna, 'announced');
    await bring(ben, 'available');
    await bring(ben, 'available');
    return { organizerId, anna, ben, eventId };
  });
  const asOrganizer = t.withIdentity({ subject: ids.organizerId });
  return { t, ...ids, asOrganizer };
}

describe('intake fee', () => {
  test('is kept from the payout for every accepted item, sold or not', async () => {
    const s = await setup(3);
    const vendors = await s.asOrganizer.query(api.eventRoles.getVendorsForEvent, {
      eventId: s.eventId,
    });
    const byName = Object.fromEntries(vendors.map((vendor) => [vendor.name, vendor]));
    expect(byName.Anna.intakeFee).toEqual({ perItem: 3, items: 3, total: 9 });
    expect(byName.Anna.payout).toBe(81);
    // Ben sold nothing and pays the fee
    expect(byName.Ben.payout).toBe(-6);

    const summary = await s.asOrganizer.query(api.events.getEventFinancialSummary, {
      eventId: s.eventId,
    });
    expect(summary.totalIntakeFees).toBe(15);
    // Ben's fee is collected from him, not netted with Anna's payout
    expect(summary.totalPendingPayout).toBe(81);
    expect(summary.totalFeesToCollect).toBe(6);
    expect(summary.sellersToCollect).toEqual([expect.objectContaining({ name: 'Ben', amount: 6 })]);
    // Cash = pending payouts − fees to collect + commission + intake fees
    expect(summary.cashInHandSoll).toBe(
      summary.totalPendingPayout -
        summary.totalFeesToCollect +
        summary.totalCommission +
        summary.totalIntakeFees
    );
  });

  test('is stored at payout and survives later changes of the setting', async () => {
    const s = await setup(3);
    await s.asOrganizer.mutation(api.eventSeller.settleVendor, {
      eventId: s.eventId,
      vendorUserId: s.ben,
    });
    const row = await s.t.run((ctx) =>
      ctx.db
        .query('eventSeller')
        .withIndex('by_event_user', (q) => q.eq('event', s.eventId).eq('user', s.ben))
        .first()
    );
    expect(row).toMatchObject({ intakeFee: 6, intakeFeeItems: 2, numberpayoutAmount: -6 });

    await s.t.run((ctx) => ctx.db.patch(s.eventId, { features: { intakeFee: 5 } }));
    const summary = await s.asOrganizer.query(api.events.getEventFinancialSummary, {
      eventId: s.eventId,
    });
    // Ben paid 6 € in: the cash grows by that
    expect(summary.totalPaidOut).toBe(0);
    expect(summary.totalFeesCollected).toBe(6);
    expect(summary.totalFeesToCollect).toBe(0);
    expect(summary.cashInHandSoll).toBe(106);

    // Taking the settlement back uses the current setting again
    await s.asOrganizer.mutation(api.eventSeller.unmarkVendorPayoutReceived, {
      eventId: s.eventId,
      vendorUserId: s.ben,
    });
    const vendors = await s.asOrganizer.query(api.eventRoles.getVendorsForEvent, {
      eventId: s.eventId,
    });
    expect(vendors.find((vendor) => vendor.name === 'Ben')?.intakeFee.total).toBe(10);
  });

  test('sellers see the fee in their sales; no fee without the setting', async () => {
    const s = await setup(3);
    const [group] = await s.t.withIdentity({ subject: s.anna }).query(api.purchases.getMySales, {});
    expect(group.totals).toMatchObject({
      intakeFee: { perItem: 3, items: 3, total: 9 },
      payout: 81,
    });
    // Ben sold nothing but still sees what he owes
    const [benGroup] = await s.t
      .withIdentity({ subject: s.ben })
      .query(api.purchases.getMySales, {});
    expect(benGroup.items).toEqual([]);
    expect(benGroup.totals).toMatchObject({ intakeFee: { items: 2, total: 6 }, payout: -6 });

    const free = await setup(undefined);
    const vendors = await free.asOrganizer.query(api.eventRoles.getVendorsForEvent, {
      eventId: free.eventId,
    });
    expect(vendors.map((vendor) => vendor.intakeFee.total)).toEqual([0, 0]);
    // Without sales and fee there is nothing to show
    expect(
      await free.t.withIdentity({ subject: free.ben }).query(api.purchases.getMySales, {})
    ).toEqual([]);
  });

  test('the setting is validated and rounded to cents', async () => {
    const s = await setup(3);
    const startDate = Date.now() + HOUR;
    await s.t.run((ctx) => ctx.db.patch(s.eventId, { startDate, endDate: startDate + HOUR }));
    const edit = (intakeFee: number) =>
      s.asOrganizer.mutation(api.events.editEvent, {
        id: s.eventId,
        title: 'Fahrradbörse',
        description: '',
        location: 'Hof',
        startDate,
        endDate: startDate + HOUR,
        contactInfo: '',
        categories: [],
        services: [],
        visibility: 'public',
        commission: 10,
        features: { intakeFee },
      });
    await expect(edit(-1)).rejects.toThrow('Annahmegebühr');
    await expect(edit(101)).rejects.toThrow('Annahmegebühr');
    await edit(2.499);
    const event = await s.t.run((ctx) => ctx.db.get(s.eventId));
    expect(event?.features?.intakeFee).toBe(2.5);
  });
});
