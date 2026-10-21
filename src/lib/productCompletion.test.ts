import { describe, expect, it } from 'vitest';
import type { Id } from './api/types';
import { findProductsToComplete, type CompletionProduct } from './productCompletion';

const product = (id: string, images: string[], eventIds: string[] = []): CompletionProduct => ({
  _id: id as Id<'products'>,
  title: id,
  price: 5,
  images,
  eventIds,
});
const bikes = { _id: 'bikes', title: 'Fahrradbörse' };
const kids = { _id: 'kids', title: 'Kinderbasar', features: { photosOptional: true } };

describe('findProductsToComplete', () => {
  it('lists items without photo for events that require one', () => {
    const items = findProductsToComplete(
      [product('puzzle', []), product('bike', ['photo'])],
      [bikes, kids]
    );
    expect(items).toEqual([
      {
        product: product('puzzle', []),
        missing: ['photo'],
        fields: [],
        eventTitles: ['Fahrradbörse'],
      },
    ]);
  });

  it('needs nothing where photos are optional', () => {
    expect(findProductsToComplete([product('puzzle', [])], [kids])).toEqual([]);
  });

  it('asks for required fields only where the category has them', () => {
    const categories = [
      { _id: 'cat-bikes', label: 'Fahrräder' },
      { _id: 'cat-toys', label: 'Spielzeug' },
    ];
    const market = {
      _id: 'market',
      title: 'Fahrradmarkt',
      features: { photosOptional: true, requiredFields: ['frameNumber'] },
    };
    const bike = { ...product('bike', []), productCategory: 'cat-bikes' };
    const numbered = {
      ...bike,
      _id: 'numbered' as Id<'products'>,
      attributes: { frameNumber: 'A1' },
    };
    const toy = { ...product('toy', []), productCategory: 'cat-toys' };

    const items = findProductsToComplete([bike, numbered, toy], [market], categories);
    expect(items.map((item) => [item.product._id, item.missing])).toEqual([
      ['bike', ['field:frameNumber']],
    ]);
    expect(items[0].fields.map((field) => field.key)).toEqual(['frameNumber']);
  });

  it('does not check events the item is already announced for', () => {
    expect(findProductsToComplete([product('puzzle', [], ['bikes'])], [bikes])).toEqual([]);
  });
});
