import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import type { StoredEventFeatures } from '../eventFeatures';
import { areQuestionsOpen, missingForEvent } from '../eventFeatures';
import { getFieldsForLabel } from '../categoryFields';

type TestConvex = ReturnType<typeof convexTest>;
const HOUR = 60 * 60 * 1000;

/** An organizer, a seller with a bike and a toy, and an upcoming bike market. */
async function setup(t: TestConvex, features: StoredEventFeatures = {}) {
  const organizerId = await t.run((ctx) =>
    ctx.db.insert('users', { name: 'Orga', email: 'orga@test.de' })
  );
  const sellerId = await t.run((ctx) =>
    ctx.db.insert('users', { name: 'Seller', email: 'seller@test.de' })
  );
  const [bikes, toys] = await t.run(async (ctx) => [
    await ctx.db.insert('categories', { label: 'Fahrräder', updatedAt: Date.now() }),
    await ctx.db.insert('categories', { label: 'Spielzeug', updatedAt: Date.now() }),
  ]);
  const asOrganizer = t.withIdentity({ subject: organizerId });
  const asSeller = t.withIdentity({ subject: sellerId });
  const eventId = await asOrganizer.mutation(api.events.createEvent, {
    title: 'Fahrradmarkt',
    description: 'Räder von privat',
    location: 'Münsterplatz',
    startDate: Date.now() + 24 * HOUR,
    endDate: Date.now() + 30 * HOUR,
    categories: [bikes, toys],
    services: [],
    contactInfo: 'orga@test.de',
    commission: 20,
    visibility: 'logged-in',
    features: { photosOptional: true, requiredFields: ['frameNumber'], ...features },
  });
  const addItem = (title: string, productCategory: Id<'categories'>) =>
    asSeller.mutation(api.products.addProduct, {
      title,
      vendorId: sellerId,
      description: '',
      condition: 'good',
      images: [],
      productCategory,
      price: 100,
      readyForSale: true,
      sold: false,
    });
  return {
    t,
    sellerId,
    bikes,
    eventId,
    asOrganizer,
    asSeller,
    bikeId: await addItem('Trekkingrad', bikes),
    toyId: await addItem('Puzzle', toys),
  };
}

describe('required item fields', () => {
  test('apply only where the category has the field', () => {
    const event = { features: { photosOptional: true, requiredFields: ['frameNumber'] } };
    const bikeFields = getFieldsForLabel('Fahrräder')!;
    expect(missingForEvent({ images: [] }, event, bikeFields)).toEqual(['field:frameNumber']);
    expect(
      missingForEvent({ images: [], attributes: { frameNumber: ' A1 ' } }, event, bikeFields)
    ).toEqual([]);
    expect(missingForEvent({ images: [] }, event, [])).toEqual([]);
  });

  test('the event keeps only known fields, and older clients do not drop them', async () => {
    const t = convexTest(schema);
    const s = await setup(t, { requiredFields: ['frameNumber', 'frameNumber', 'unknown'] });
    const stored = () => t.run(async (ctx) => (await ctx.db.get(s.eventId))?.features);
    expect((await stored())?.requiredFields).toEqual(['frameNumber']);

    // A client that does not know the setting sends features without it
    const event = (await t.run((ctx) => ctx.db.get(s.eventId)))!;
    await s.asOrganizer.mutation(api.events.editEvent, {
      id: s.eventId,
      title: event.title,
      description: event.description,
      location: event.location,
      startDate: event.startDate,
      endDate: event.endDate,
      categories: event.categories,
      services: [],
      contactInfo: event.contactInfo,
      commission: event.commission,
      visibility: 'logged-in',
      features: { photosOptional: true },
    });
    expect((await stored())?.requiredFields).toEqual(['frameNumber']);
  });

  test('an item without the required field cannot be announced, others can', async () => {
    const s = await setup(convexTest(schema));
    await expect(
      s.asSeller.mutation(api.eventProducts.addProductToEvent, {
        eventId: s.eventId,
        productId: s.bikeId,
      })
    ).rejects.toThrow('„Trekkingrad“ braucht für „Fahrradmarkt“ noch: Rahmennummer.');
    await expect(
      s.asSeller.mutation(api.eventProducts.setProductEvents, {
        productId: s.bikeId,
        eventIds: [s.eventId],
      })
    ).rejects.toThrow('product.incomplete');
    // Toys have no frame number
    await s.asSeller.mutation(api.eventProducts.addProductToEvent, {
      eventId: s.eventId,
      productId: s.toyId,
    });
  });

  test('filling in the field makes the item ready; only the seller may do it', async () => {
    const s = await setup(convexTest(schema));
    const strangerId = await s.t.run((ctx) =>
      ctx.db.insert('users', { name: 'Stranger', email: 'stranger@test.de' })
    );
    await expect(
      s.t.withIdentity({ subject: strangerId }).mutation(api.products.addProductAttributes, {
        productId: s.bikeId,
        attributes: { frameNumber: 'X' },
      })
    ).rejects.toThrow('auth.forbidden');

    await s.asSeller.mutation(api.products.addProductAttributes, {
      productId: s.bikeId,
      attributes: { frameNumber: ' WBK123 ', notAField: 'x' },
    });
    expect((await s.t.run((ctx) => ctx.db.get(s.bikeId)))?.attributes).toEqual({
      frameNumber: 'WBK123',
    });
    await s.asSeller.mutation(api.eventProducts.addProductToEvent, {
      eventId: s.eventId,
      productId: s.bikeId,
    });
  });

  test('an edit cannot remove a required field while the item is announced', async () => {
    const s = await setup(convexTest(schema));
    await s.asSeller.mutation(api.products.addProductAttributes, {
      productId: s.bikeId,
      attributes: { frameNumber: 'WBK123', brand: 'Cube' },
    });
    await s.asSeller.mutation(api.eventProducts.addProductToEvent, {
      eventId: s.eventId,
      productId: s.bikeId,
    });
    const edit = (attributes: Record<string, string>) =>
      s.asSeller.mutation(api.products.updateProduct, {
        productId: s.bikeId,
        title: 'Trekkingrad',
        description: '',
        condition: 'good',
        productCategory: s.bikes,
        images: [],
        price: 90,
        readyForSale: true,
        attributes,
      });
    await expect(edit({ brand: 'Cube' })).rejects.toThrow(
      'Für „Fahrradmarkt“ ist die Angabe „Rahmennummer“ nötig.'
    );
    await edit({ frameNumber: 'WBK123' });
  });
});

describe('questions only during the bazaar', () => {
  const event = (startDate: number, features: StoredEventFeatures) => ({
    startDate,
    endDate: startDate + 4 * HOUR,
    features,
  });

  test('open while the event runs, or always without the setting', () => {
    const now = Date.now();
    const onlyDuring = { questions: true, questionsDuringEventOnly: true };
    expect(areQuestionsOpen(event(now + HOUR, onlyDuring), now)).toBe(false);
    expect(areQuestionsOpen(event(now - HOUR, onlyDuring), now)).toBe(true);
    expect(areQuestionsOpen(event(now + HOUR, { questions: true }), now)).toBe(true);
    expect(areQuestionsOpen(event(now - HOUR, { questions: false }), now)).toBe(false);
  });

  test('asking before the start is rejected, once it runs it works', async () => {
    const s = await setup(convexTest(schema), {
      requiredFields: [],
      questions: true,
      questionsDuringEventOnly: true,
    });
    await s.asSeller.mutation(api.eventProducts.addProductToEvent, {
      eventId: s.eventId,
      productId: s.toyId,
    });
    const buyerId = await s.t.run((ctx) =>
      ctx.db.insert('users', { name: 'Buyer', email: 'buyer@test.de' })
    );
    const ask = () =>
      s.t.withIdentity({ subject: buyerId }).mutation(api.productQuestions.ask, {
        productId: s.toyId,
        question: 'Ist das Puzzle vollständig?',
      });
    await expect(ask()).rejects.toThrow('question.notYet');

    await s.t.run((ctx) => ctx.db.patch(s.eventId, { startDate: Date.now() - HOUR }));
    await ask();
  });
});
