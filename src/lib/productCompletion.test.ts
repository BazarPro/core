import { describe, expect, it } from 'vitest';
import type { Id } from '../../convex/_generated/dataModel';
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
      { product: product('puzzle', []), missing: ['photo'], eventTitles: ['Fahrradbörse'] },
    ]);
  });

  it('needs nothing where photos are optional', () => {
    expect(findProductsToComplete([product('puzzle', [])], [kids])).toEqual([]);
  });

  it('does not check events the item is already announced for', () => {
    expect(findProductsToComplete([product('puzzle', [], ['bikes'])], [bikes])).toEqual([]);
  });
});
