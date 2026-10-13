import { describe, expect, it } from 'vitest';
import type { SaleInfo } from '../../convex/sales';
import { buildPriceLines, feePercent, priceSourceLabel } from './saleBreakdown';

const sale = (overrides: Partial<SaleInfo>): SaleInfo => ({
  listPrice: 200,
  priceSource: 'list',
  totalAmount: 200,
  commission: 20,
  payout: 180,
  soldAt: 0,
  ...overrides,
});

describe('buildPriceLines', () => {
  it('explains a VB sale and deducts the fee on the seller copy', () => {
    const negotiated = sale({
      priceSource: 'negotiated',
      totalAmount: 170,
      commission: 17,
      payout: 153,
    });
    expect(buildPriceLines(negotiated, 'buyer')).toEqual([
      { label: 'Etikettpreis', amount: 200, kind: 'base' },
      { label: 'Nachlass, an der Kasse verhandelt (VB)', amount: -30, kind: 'deduction' },
      { label: 'Verkaufspreis', amount: 170, kind: 'total' },
    ]);
    expect(buildPriceLines(negotiated, 'seller').slice(3)).toEqual([
      { label: 'Bazar-Gebühr (10 %)', amount: -17, kind: 'deduction' },
      { label: 'Auszahlung an den Verkäufer', amount: 153, kind: 'total' },
    ]);
  });

  it('shows discount and offer reductions', () => {
    expect(
      buildPriceLines(sale({ discountPercent: 10, totalAmount: 180 }), 'buyer')[1]
    ).toMatchObject({ label: 'Rabatt (10 %)', amount: -20 });
    expect(
      buildPriceLines(sale({ priceSource: 'offer', totalAmount: 150 }), 'buyer')[1]
    ).toMatchObject({ label: 'Nachlass durch angenommenen Preisvorschlag', amount: -50 });
  });

  it('has no reduction line for a sale at the label price', () => {
    expect(buildPriceLines(sale({}), 'buyer').map((l) => l.label)).toEqual([
      'Etikettpreis',
      'Verkaufspreis',
    ]);
  });
});

describe('feePercent and priceSourceLabel', () => {
  it('derives the fee and labels the source', () => {
    expect(feePercent(sale({ commission: 12.5, totalAmount: 100 }))).toBe(12.5);
    expect(feePercent(sale({ totalAmount: 0, commission: 0 }))).toBeNull();
    expect(priceSourceLabel(sale({ priceSource: 'offer' }))).toBe('Preisvorschlag');
    expect(priceSourceLabel(sale({ discountPercent: 20 }))).toBe('−20 % Rabatt');
    expect(priceSourceLabel(sale({}))).toBeNull();
  });
});
