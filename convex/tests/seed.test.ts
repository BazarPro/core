import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { internal } from '../_generated/api';

describe('seed.isSeeded', () => {
  test('is false for an empty database', async () => {
    const t = convexTest(schema);
    expect(await t.query(internal.seed.isSeeded, {})).toBe(false);
  });

  test('is true once the seed admin exists', async () => {
    const t = convexTest(schema);
    await t.run((ctx) =>
      ctx.db.insert('users', { name: 'Admin User', email: 'admin@bazarpro.de' })
    );
    expect(await t.query(internal.seed.isSeeded, {})).toBe(true);
  });

  test('runSeed skips an already seeded database', async () => {
    const t = convexTest(schema);
    await t.run((ctx) =>
      ctx.db.insert('users', { name: 'Admin User', email: 'admin@bazarpro.de' })
    );
    await expect(t.action(internal.seed.runSeed, {})).resolves.toMatch(/übersprungen/);
    const events = await t.run((ctx) => ctx.db.query('events').collect());
    expect(events).toHaveLength(0);
  });
});

describe('seed.insertSeedData', () => {
  async function seeded() {
    const t = convexTest(schema);
    await t.mutation(internal.seed.seedCategories, {});
    const imageId = await t.run((ctx) => ctx.storage.store(new Blob(['img'])));
    await t.mutation(internal.seed.insertSeedData, {
      eventImageIds: [imageId, imageId, imageId],
      productImageIds: Array(7).fill(imageId),
    });
    const events = await t.run((ctx) => ctx.db.query('events').collect());
    const byTitle = (prefix: string) => events.find((e) => e.title.startsWith(prefix))!;
    return { t, byTitle };
  }

  test('every seller with items in an event is registered as participant', async () => {
    const { t } = await seeded();
    const { relations, roles, sellerRows } = await t.run(async (ctx) => ({
      relations: await ctx.db.query('eventProducts').collect(),
      roles: await ctx.db.query('eventRole').collect(),
      sellerRows: await ctx.db.query('eventSeller').collect(),
    }));
    for (const relation of relations) {
      const product = await t.run((ctx) => ctx.db.get(relation.productId));
      const hasRole = roles.some(
        (r) => r.event === relation.eventId && r.user === product!.vendorId && r.roles === 'seller'
      );
      const hasRow = sellerRows.some(
        (r) => r.event === relation.eventId && r.user === product!.vendorId
      );
      expect({ product: product!.title, hasRole, hasRow }).toEqual({
        product: product!.title,
        hasRole: true,
        hasRow: true,
      });
    }
  });

  test('the showcase event runs with all features and data in every state', async () => {
    const { t, byTitle } = await seeded();
    const event = byTitle('Fahrradbörse Bürgerhalle');
    const now = Date.now();
    expect(event.startDate).toBeLessThan(now);
    expect(event.endDate).toBeGreaterThan(now);
    expect(event.features).toMatchObject({
      discounts: true,
      priceOffers: true,
      minimumPrice: true,
      questions: true,
    });

    const data = await t.run(async (ctx) => ({
      relations: (await ctx.db.query('eventProducts').collect()).filter(
        (r) => r.eventId === event._id
      ),
      offers: (await ctx.db.query('productOffers').collect()).filter(
        (o) => o.eventId === event._id
      ),
      questions: (await ctx.db.query('productQuestions').collect()).filter(
        (q) => q.eventId === event._id
      ),
      purchases: (await ctx.db.query('purchase').collect()).filter((p) => p.event === event._id),
      walkIns: (await ctx.db.query('users').collect()).filter(
        (u) => u.managedByEventId === event._id
      ),
    }));

    expect(new Set(data.relations.map((r) => r.status))).toEqual(
      new Set(['announced', 'available', 'sold', 'returned'])
    );
    expect(data.relations.some((r) => r.discountPercent)).toBe(true);
    expect(data.relations.some((r) => r.internalNote)).toBe(true);
    expect(new Set(data.offers.map((o) => o.status))).toEqual(new Set(['pending', 'accepted']));
    expect(data.questions.some((q) => q.answer)).toBe(true);
    expect(data.questions.some((q) => !q.answer)).toBe(true);
    expect(new Set(data.purchases.map((p) => p.priceSource))).toEqual(
      new Set(['list', 'offer', 'negotiated'])
    );
    expect(data.walkIns).toHaveLength(1);
    // Every sold item has exactly one purchase
    const sold = data.relations.filter((r) => r.status === 'sold');
    expect(data.purchases).toHaveLength(sold.length);
  });
});
