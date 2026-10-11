import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import type { StoredEventFeatures } from '../eventFeatures';

type TestConvex = ReturnType<typeof convexTest>;

const HOUR = 60 * 60 * 1000;

async function insertUser(t: TestConvex, email: string) {
  return await t.run((ctx) =>
    ctx.db.insert('users', { name: email.split('@')[0], firstName: email.split('@')[0], email })
  );
}

/**
 * Running event (started an hour ago) with one seller, one buyer and one available bike.
 */
async function setup(
  t: TestConvex,
  options: { features?: StoredEventFeatures; product?: Record<string, unknown> } = {}
) {
  const organizerId = await insertUser(t, 'orga@test.de');
  const sellerId = await insertUser(t, 'seller@test.de');
  const buyerId = await insertUser(t, 'buyer@test.de');
  const categoryId = await t.run((ctx) =>
    ctx.db.insert('categories', { label: 'Fahrräder', updatedAt: Date.now() })
  );

  const eventId = await t.withIdentity({ subject: organizerId }).mutation(api.events.createEvent, {
    title: 'Fahrradbörse',
    description: 'Gebrauchte Räder',
    location: 'Bürgerhalle',
    startDate: Date.now() - HOUR,
    endDate: Date.now() + 5 * HOUR,
    categories: [categoryId],
    services: [],
    contactInfo: 'orga@test.de',
    commission: 10,
    visibility: 'logged-in',
    features: options.features,
  });

  const productId = await t.withIdentity({ subject: sellerId }).mutation(api.products.addProduct, {
    title: 'Trekkingrad',
    vendorId: sellerId,
    description: '28 Zoll',
    condition: 'good',
    images: [],
    productCategory: categoryId,
    price: 200,
    readyForSale: true,
    sold: false,
    ...options.product,
  });
  const eventProductId = await t.run(async (ctx) => {
    await ctx.db.insert('eventRole', { event: eventId, user: sellerId, roles: 'seller' });
    return await ctx.db.insert('eventProducts', { eventId, productId, status: 'available' });
  });

  return {
    organizerId,
    sellerId,
    buyerId,
    categoryId,
    eventId,
    productId,
    eventProductId,
    asOrganizer: t.withIdentity({ subject: organizerId }),
    asSeller: t.withIdentity({ subject: sellerId }),
    asBuyer: t.withIdentity({ subject: buyerId }),
  };
}

async function scheduledMails(t: TestConvex) {
  const jobs = await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
  return jobs
    .filter((job) => job.name.includes('sendNotification'))
    .map((job) => job.args[0] as { to: string; subject: string });
}

describe('event features: discounts', () => {
  test('old events without features keep discounts up to 50 %', async () => {
    const t = convexTest(schema);
    const s = await setup(t);
    await s.asSeller.mutation(api.eventProducts.updateProductDiscount, {
      eventId: s.eventId,
      productId: s.productId,
      discountPercent: 50,
    });
    const ep = await t.run((ctx) => ctx.db.get(s.eventProductId));
    expect(ep?.discountPercent).toBe(50);
  });

  test('organizer can switch discounts off', async () => {
    const t = convexTest(schema);
    const s = await setup(t, { features: { discounts: false } });
    await expect(
      s.asSeller.mutation(api.eventProducts.updateProductDiscount, {
        eventId: s.eventId,
        productId: s.productId,
        discountPercent: 10,
      })
    ).rejects.toThrow('keine Rabatte');
  });

  test('discounts wait for the start time and respect the maximum', async () => {
    const t = convexTest(schema);
    const s = await setup(t, {
      features: { discounts: true, discountStartsAt: Date.now() + HOUR, maxDiscountPercent: 30 },
    });
    const discount = (discountPercent: number) =>
      s.asSeller.mutation(api.eventProducts.updateProductDiscount, {
        eventId: s.eventId,
        productId: s.productId,
        discountPercent,
      });

    await expect(discount(10)).rejects.toThrow('festgelegten Uhrzeit');

    await t.run((ctx) =>
      ctx.db.patch(s.eventId, {
        features: { discounts: true, discountStartsAt: Date.now() - 1000, maxDiscountPercent: 30 },
      })
    );
    await expect(discount(40)).rejects.toThrow('Maximaler Rabatt ist 30%');
    await discount(30);
  });

  test('editing without features keeps the stored ones', async () => {
    const t = convexTest(schema);
    const s = await setup(t, { features: { discounts: false, questions: true } });
    const event = await t.run((ctx) => ctx.db.get(s.eventId));
    await s.asOrganizer.mutation(api.events.editEvent, {
      id: s.eventId,
      title: 'Neuer Titel',
      description: event!.description,
      location: event!.location,
      startDate: event!.startDate,
      endDate: event!.endDate,
      categories: event!.categories,
      contactInfo: event!.contactInfo,
      commission: event!.commission,
      services: [],
      visibility: event!.visibility,
    });
    const updated = await t.run((ctx) => ctx.db.get(s.eventId));
    expect(updated?.features?.discounts).toBe(false);
    expect(updated?.features?.questions).toBe(true);
  });

  test('rejects an invalid maximum discount', async () => {
    const t = convexTest(schema);
    await expect(setup(t, { features: { maxDiscountPercent: 80 } })).rejects.toThrow(
      'Höchstrabatt'
    );
  });
});

describe('event features: price offers', () => {
  test('offers need the event feature and the seller opt-in', async () => {
    const t = convexTest(schema);
    const s = await setup(t, { product: { acceptsOffers: true } });
    await expect(
      s.asBuyer.mutation(api.offers.makeOffer, { productId: s.productId, amount: 150 })
    ).rejects.toThrow('keine Preisvorschläge');

    await t.run((ctx) => ctx.db.patch(s.eventId, { features: { priceOffers: true } }));
    await t.run((ctx) => ctx.db.patch(s.productId, { acceptsOffers: false }));
    await expect(
      s.asBuyer.mutation(api.offers.makeOffer, { productId: s.productId, amount: 150 })
    ).rejects.toThrow('keine Preisvorschläge');
  });

  test('offer must be below the current price and not for own items', async () => {
    const t = convexTest(schema);
    const s = await setup(t, {
      features: { priceOffers: true },
      product: { acceptsOffers: true },
    });
    await expect(
      s.asBuyer.mutation(api.offers.makeOffer, { productId: s.productId, amount: 200 })
    ).rejects.toThrow('unter dem aktuellen Preis');
    await expect(
      s.asSeller.mutation(api.offers.makeOffer, { productId: s.productId, amount: 100 })
    ).rejects.toThrow('eigene Artikel');
  });

  test('accepting one offer rejects the others; the cash desk sells at the agreed price', async () => {
    const t = convexTest(schema);
    const s = await setup(t, {
      features: { priceOffers: true },
      product: { acceptsOffers: true },
    });
    const otherBuyer = t.withIdentity({ subject: await insertUser(t, 'other@test.de') });

    const offerId = await s.asBuyer.mutation(api.offers.makeOffer, {
      productId: s.productId,
      amount: 150,
      message: 'Hole es um 14 Uhr ab',
    });
    const otherOfferId = await otherBuyer.mutation(api.offers.makeOffer, {
      productId: s.productId,
      amount: 120,
    });
    // A second offer by the same buyer updates the open one
    await s.asBuyer.mutation(api.offers.makeOffer, { productId: s.productId, amount: 160 });

    const offers = await s.asSeller.query(api.offers.getOffersForProduct, {
      productId: s.productId,
    });
    expect(offers.map((o) => o.amount)).toEqual([160, 120]);
    expect(
      await s.asBuyer.query(api.offers.getOffersForProduct, { productId: s.productId })
    ).toEqual([]);

    await s.asSeller.mutation(api.offers.respondToOffer, { offerId, accept: true });
    const other = await t.run((ctx) => ctx.db.get(otherOfferId));
    expect(other?.status).toBe('rejected');

    const atCashDesk = await s.asOrganizer.query(api.offers.getAcceptedOffersForEventProduct, {
      eventProductId: s.eventProductId,
    });
    expect(atCashDesk).toHaveLength(1);

    await s.asOrganizer.mutation(api.purchases.sellProduct, {
      eventProductId: s.eventProductId,
      offerId,
    });
    const purchase = await t.run((ctx) => ctx.db.query('purchase').first());
    expect(purchase).toMatchObject({
      totalAmount: 160,
      listPrice: 200,
      priceSource: 'offer',
      comissionAmount: 16,
      payoutAmount: 144,
    });

    const mails = await scheduledMails(t);
    expect(mails.some((m) => m.to === 'seller@test.de' && m.subject.startsWith('Verkauft'))).toBe(
      true
    );
    expect(mails.some((m) => m.to === 'buyer@test.de' && m.subject.includes('angenommen'))).toBe(
      true
    );
  });

  test('a rejected offer cannot be redeemed at the cash desk', async () => {
    const t = convexTest(schema);
    const s = await setup(t, {
      features: { priceOffers: true },
      product: { acceptsOffers: true },
    });
    const offerId = await s.asBuyer.mutation(api.offers.makeOffer, {
      productId: s.productId,
      amount: 150,
    });
    await s.asSeller.mutation(api.offers.respondToOffer, { offerId, accept: false });
    await expect(
      s.asOrganizer.mutation(api.purchases.sellProduct, {
        eventProductId: s.eventProductId,
        offerId,
      })
    ).rejects.toThrow('nicht (mehr) angenommen');
  });
});

describe('event features: minimum price', () => {
  test('minimum price is hidden from buyers', async () => {
    const t = convexTest(schema);
    const s = await setup(t, { features: { minimumPrice: true }, product: { minimumPrice: 150 } });
    const asBuyer = await s.asBuyer.query(api.products.getProduct, { productId: s.productId });
    const asSeller = await s.asSeller.query(api.products.getProduct, { productId: s.productId });
    const anonymous = await t.query(api.eventProducts.getProductsForEvent, { eventId: s.eventId });
    expect(asBuyer?.minimumPrice).toBeUndefined();
    expect(asSeller?.minimumPrice).toBe(150);
    expect(anonymous[0]).not.toHaveProperty('minimumPrice');
  });

  test('minimum price must be below the price', async () => {
    const t = convexTest(schema);
    await expect(setup(t, { product: { minimumPrice: 250 } })).rejects.toThrow(
      'unter dem Verkaufspreis'
    );
  });

  test('cash desk may sell between minimum and list price', async () => {
    const t = convexTest(schema);
    const s = await setup(t, { features: { minimumPrice: true }, product: { minimumPrice: 150 } });
    const sell = (negotiatedPrice: number) =>
      s.asOrganizer.mutation(api.purchases.sellProduct, {
        eventProductId: s.eventProductId,
        negotiatedPrice,
      });
    await expect(sell(140)).rejects.toThrow('zwischen');
    await sell(170);
    const purchase = await t.run((ctx) => ctx.db.query('purchase').first());
    expect(purchase).toMatchObject({ totalAmount: 170, priceSource: 'negotiated', listPrice: 200 });
  });

  test('negotiating needs the event feature', async () => {
    const t = convexTest(schema);
    const s = await setup(t, { product: { minimumPrice: 150 } });
    await expect(
      s.asOrganizer.mutation(api.purchases.sellProduct, {
        eventProductId: s.eventProductId,
        negotiatedPrice: 170,
      })
    ).rejects.toThrow('kein Verhandlungspreis');
  });
});

describe('event features: questions', () => {
  test('questions need the event feature', async () => {
    const t = convexTest(schema);
    const s = await setup(t);
    await expect(
      s.asBuyer.mutation(api.productQuestions.ask, {
        productId: s.productId,
        question: 'Ist das Licht dabei?',
      })
    ).rejects.toThrow('keine Fragen');
  });

  test('ask, answer and see it publicly', async () => {
    const t = convexTest(schema);
    const s = await setup(t, { features: { questions: true } });
    const questionId = await s.asBuyer.mutation(api.productQuestions.ask, {
      productId: s.productId,
      question: 'Ist das Licht dabei?',
    });
    await expect(
      s.asBuyer.mutation(api.productQuestions.answer, { questionId, answer: 'Ja' })
    ).rejects.toThrow('Not authorized');
    await s.asSeller.mutation(api.productQuestions.answer, {
      questionId,
      answer: 'Ja, vorne und hinten',
    });

    const list = await t.query(api.productQuestions.listForProduct, { productId: s.productId });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ answer: 'Ja, vorne und hinten', askerName: 'buyer' });

    const mails = await scheduledMails(t);
    expect(mails.map((m) => m.to).sort()).toEqual(['buyer@test.de', 'seller@test.de']);
  });

  test('only asker, seller or organizer may delete', async () => {
    const t = convexTest(schema);
    const s = await setup(t, { features: { questions: true } });
    const questionId = await s.asBuyer.mutation(api.productQuestions.ask, {
      productId: s.productId,
      question: 'Ist das Licht dabei?',
    });
    const stranger = t.withIdentity({ subject: await insertUser(t, 'x@test.de') });
    await expect(stranger.mutation(api.productQuestions.remove, { questionId })).rejects.toThrow(
      'Not authorized'
    );
    await s.asOrganizer.mutation(api.productQuestions.remove, { questionId });
    expect(await t.query(api.productQuestions.listForProduct, { productId: s.productId })).toEqual(
      []
    );
  });
});

describe('category fields and internal notes', () => {
  test('only fields of the category are stored', async () => {
    const t = convexTest(schema);
    const s = await setup(t, {
      product: { attributes: { frameNumber: ' WBK123 ', colour: 'rot', brand: '' } },
    });
    const product = await t.run((ctx) => ctx.db.get(s.productId));
    expect(product?.attributes).toEqual({ frameNumber: 'WBK123' });

    const view = await t.query(api.products.getProduct, { productId: s.productId });
    expect(view?.attributeList).toEqual([{ label: 'Rahmennummer', value: 'WBK123' }]);
  });

  test('internal note is for organizers only', async () => {
    const t = convexTest(schema);
    const s = await setup(t);
    await expect(
      s.asSeller.mutation(api.eventProducts.setEventProductNote, {
        eventProductId: s.eventProductId,
        note: 'Haken 12',
      })
    ).rejects.toThrow('Not authorized');
    await s.asOrganizer.mutation(api.eventProducts.setEventProductNote, {
      eventProductId: s.eventProductId,
      note: 'Haken 12',
    });
    const managed = await s.asOrganizer.query(api.eventProducts.getProductsForEventManagement, {
      eventId: s.eventId,
    });
    expect(managed[0].internalNote).toBe('Haken 12');
    const publicList = await t.query(api.eventProducts.getProductsForEvent, { eventId: s.eventId });
    expect(publicList[0]).not.toHaveProperty('internalNote');
  });
});

describe('sale notifications and receipts', () => {
  test('sale emails the seller and, on request, a receipt to the buyer', async () => {
    const t = convexTest(schema);
    const s = await setup(t, { product: { attributes: { frameNumber: 'WBK123' } } });
    await expect(
      s.asOrganizer.mutation(api.purchases.sellProduct, {
        eventProductId: s.eventProductId,
        buyerEmail: 'kein-mail',
      })
    ).rejects.toThrow('gültige E-Mail');

    await s.asOrganizer.mutation(api.purchases.sellProduct, {
      eventProductId: s.eventProductId,
      buyerEmail: 'kaeufer@example.com',
    });
    const mails = await scheduledMails(t);
    expect(mails.map((m) => m.to).sort()).toEqual(['kaeufer@example.com', 'seller@test.de']);
  });
});

describe('walk-in sellers', () => {
  async function createWalkIn(t: TestConvex, s: Awaited<ReturnType<typeof setup>>) {
    const walkInId = await s.asOrganizer.mutation(api.walkInSellers.createWalkInSeller, {
      eventId: s.eventId,
      firstName: 'Erika',
      lastName: 'Muster',
      contactEmail: 'erika@example.com',
    });
    const productId = await s.asOrganizer.mutation(api.walkInSellers.saveWalkInProduct, {
      eventId: s.eventId,
      sellerId: walkInId,
      title: 'Kinderrad',
      description: '',
      condition: 'ok',
      productCategory: s.categoryId,
      price: 40,
    });
    return { walkInId: walkInId as Id<'users'>, productId };
  }

  test('organizer creates a seller without login and lists items for them', async () => {
    const t = convexTest(schema);
    const s = await setup(t);
    const { walkInId, productId } = await createWalkIn(t, s);

    const vendors = await s.asOrganizer.query(api.eventRoles.getVendorsForEvent, {
      eventId: s.eventId,
    });
    expect(vendors.find((v) => v._id === walkInId)?.managedByEventId).toBe(s.eventId);
    const ep = await t.run((ctx) =>
      ctx.db
        .query('eventProducts')
        .withIndex('by_productId', (q) => q.eq('productId', productId))
        .unique()
    );
    expect(ep?.status).toBe('announced');
  });

  test('other users cannot create walk-in sellers or edit regular sellers', async () => {
    const t = convexTest(schema);
    const s = await setup(t);
    await expect(
      s.asSeller.mutation(api.walkInSellers.createWalkInSeller, {
        eventId: s.eventId,
        firstName: 'A',
        lastName: 'B',
      })
    ).rejects.toThrow('Not authorized');
    await expect(
      s.asOrganizer.mutation(api.walkInSellers.saveWalkInProduct, {
        eventId: s.eventId,
        sellerId: s.sellerId,
        title: 'Fremdes Rad',
        description: '',
        condition: 'ok',
        productCategory: s.categoryId,
        price: 40,
      })
    ).rejects.toThrow('vor Ort angelegten');
  });

  test('organizer answers questions for walk-in sellers; sale mail goes to contact email', async () => {
    const t = convexTest(schema);
    const s = await setup(t, { features: { questions: true } });
    const { productId } = await createWalkIn(t, s);
    const questionId = await s.asBuyer.mutation(api.productQuestions.ask, {
      productId,
      question: 'Welche Größe?',
    });
    await s.asOrganizer.mutation(api.productQuestions.answer, { questionId, answer: '20 Zoll' });

    const ep = await t.run((ctx) =>
      ctx.db
        .query('eventProducts')
        .withIndex('by_productId', (q) => q.eq('productId', productId))
        .unique()
    );
    await t.run((ctx) => ctx.db.patch(ep!._id, { status: 'available' }));
    await s.asOrganizer.mutation(api.purchases.sellProduct, { eventProductId: ep!._id });
    const mails = await scheduledMails(t);
    expect(
      mails.some((m) => m.to === 'erika@example.com' && m.subject.startsWith('Verkauft'))
    ).toBe(true);
  });
});
