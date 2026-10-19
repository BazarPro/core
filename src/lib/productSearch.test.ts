import { describe, expect, it } from 'vitest';
import { matchingVendors, parseSellerNumber, productMatcher } from './productSearch';

const vendors = new Map([
  ['anna', { name: 'Anna Muster', email: 'anna@test.de', sellerNumber: 1 }],
  ['ben', { name: 'Ben 17er', email: 'ben@test.de', sellerNumber: 17 }],
]);
const products = [
  { _id: 'p1', title: 'Kinderrad', vendorId: 'anna' },
  { _id: 'p2', title: 'Jacke Gr. 104', vendorId: 'ben', internalNote: 'Fleck am Ärmel' },
  { _id: 'p3', title: 'Roller', vendorId: 'ben' },
];
const search = (term: string) => products.filter(productMatcher(term, vendors)).map((p) => p._id);

describe('product search', () => {
  it('reads seller numbers', () => {
    expect(['17', 'Nr. 17', 'nr17', '#17', ' 17 '].map(parseSellerNumber)).toEqual([
      17, 17, 17, 17, 17,
    ]);
    expect(['0', 'Rad 17', '17a', ''].map(parseSellerNumber)).toEqual([null, null, null, null]);
  });

  it('a number finds the seller exactly, not as part of another number', () => {
    expect(search('17')).toEqual(['p2', 'p3']);
    expect(search('Nr. 1')).toEqual(['p1']);
    // Titles still match numbers
    expect(search('104')).toEqual(['p2']);
  });

  it('text matches title, note and seller name', () => {
    expect(search('rad')).toEqual(['p1']);
    expect(search('fleck')).toEqual(['p2']);
    expect(search('anna')).toEqual(['p1']);
    expect(search('')).toEqual(['p1', 'p2', 'p3']);
  });

  it('suggests the seller with the number first', () => {
    const list = [...vendors.values()];
    expect(matchingVendors('17', list).map((v) => v.sellerNumber)).toEqual([17]);
    expect(matchingVendors('test.de', list)).toHaveLength(2);
    expect(matchingVendors('', list)).toEqual([]);
  });
});
