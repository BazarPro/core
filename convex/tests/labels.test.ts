import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';

const HOUR = 60 * 60 * 1000;

async function setup(features: Doc<'events'>['features'] = {}) {
  const t = convexTest(schema);
  const ids = await t.run(async (ctx) => {
    const organizerId = await ctx.db.insert('users', { name: 'Orga', email: 'orga@test.de' });
    const sellerId = await ctx.db.insert('users', { name: 'Anna', email: 'anna@test.de' });
    const strangerId = await ctx.db.insert('users', { name: 'Fremd', email: 'fremd@test.de' });
    const categoryId = await ctx.db.insert('categories', {
      label: 'Kinderkleidung',
      updatedAt: Date.now(),
    });
    const event = (title: string, eventFeatures: Doc<'events'>['features'], inDays: number) =>
      ctx.db.insert('events', {
        title,
        description: '',
        location: 'Halle',
        startDate: Date.now() + inDays * 24 * HOUR,
        endDate: Date.now() + inDays * 24 * HOUR + 6 * HOUR,
        contactInfo: '',
        categories: [categoryId],
        services: [],
        visibility: 'public',
        approvalStatus: 'approved',
        commission: 10,
        organizerId,
        features: eventFeatures,
      });
    const eventId = await event('Kinderbasar', features, 1);
    const laterEventId = await event('Fahrradbörse', {}, 10);
    await ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' });
    await ctx.db.insert('eventSeller', {
      event: eventId,
      user: sellerId,
      totalFee: 0,
      comissionFee: 0,
      numberpayoutAmount: 0,
      payoutReceived: false,
      number: 17,
    });
    const product = (title: string, attributes?: Record<string, string>) =>
      ctx.db.insert('products', {
        title,
        vendorId: sellerId,
        description: '',
        condition: 'good',
        images: [],
        productCategory: categoryId,
        price: 5,
        readyForSale: true,
        sold: false,
        updatedAt: Date.now(),
        attributes,
      });
    const bodyId = await product('Body', { size: '74' });
    const bikeId = await product('Kinderrad');
    const draftId = await product('Noch nirgends');
    await ctx.db.insert('eventProducts', { eventId, productId: bodyId, status: 'announced' });
    await ctx.db.insert('eventProducts', {
      eventId: laterEventId,
      productId: bikeId,
      status: 'announced',
    });
    return { organizerId, sellerId, strangerId, eventId, bodyId, bikeId, draftId };
  });
  const as = (id: Id<'users'>) => t.withIdentity({ subject: id });
  return { t, ...ids, as };
}

describe('label data', () => {
  test('seller number, size and the label sheet of the bazaar', async () => {
    const s = await setup({ labelFormat: 'small' });
    const data = await s.as(s.sellerId).query(api.labels.getLabelData, {
      productIds: [s.bodyId],
    });
    expect(data).toEqual({
      format: 'small',
      labels: [{ productId: s.bodyId, title: 'Body', sellerNumber: 17, size: '74' }],
    });
  });

  test('the price only when the bazaar prints it and has no discounts', async () => {
    const withPrice = await setup({ priceOnLabel: true, discounts: false });
    const [label] = (
      await withPrice.as(withPrice.sellerId).query(api.labels.getLabelData, {
        productIds: [withPrice.bodyId],
      })
    ).labels;
    expect(label.price).toBe(5);

    const withDiscounts = await setup({ priceOnLabel: true, discounts: true });
    const [discounted] = (
      await withDiscounts.as(withDiscounts.sellerId).query(api.labels.getLabelData, {
        productIds: [withDiscounts.bodyId],
      })
    ).labels;
    expect(discounted.price).toBeUndefined();
  });

  test('items of different bazaars fall back to large labels; items without bazaar work too', async () => {
    const s = await setup({ labelFormat: 'small' });
    const data = await s.as(s.sellerId).query(api.labels.getLabelData, {
      productIds: [s.bodyId, s.bikeId, s.draftId],
    });
    expect(data.format).toBe('standard');
    expect(data.labels.map((label) => [label.title, label.sellerNumber])).toEqual([
      ['Body', 17],
      // No number at the Fahrradbörse yet, and none without a bazaar
      ['Kinderrad', undefined],
      ['Noch nirgends', undefined],
    ]);
  });

  test("the event team prints the bazaar's items, nobody else", async () => {
    const s = await setup();
    const data = await s.as(s.organizerId).query(api.labels.getLabelData, {
      productIds: [s.bodyId],
      eventId: s.eventId,
    });
    expect(data.labels[0].sellerNumber).toBe(17);

    // The bike is not at this bazaar
    await expect(
      s.as(s.organizerId).query(api.labels.getLabelData, {
        productIds: [s.bikeId],
        eventId: s.eventId,
      })
    ).rejects.toThrow('Not authorized');
    await expect(
      s.as(s.strangerId).query(api.labels.getLabelData, {
        productIds: [s.bodyId],
        eventId: s.eventId,
      })
    ).rejects.toThrow('Not authorized');
    await expect(
      s.as(s.strangerId).query(api.labels.getLabelData, { productIds: [s.bodyId] })
    ).rejects.toThrow('Not authorized');
    await expect(s.t.query(api.labels.getLabelData, { productIds: [] })).rejects.toThrow(
      'Not authenticated'
    );
  });
});
