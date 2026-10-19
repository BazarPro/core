import { describe, expect, it } from 'vitest';
import { describeSellerFees } from './sellerFees';

describe('describeSellerFees', () => {
  it('explains commission and intake fee with an example', () => {
    const { lines, example } = describeSellerFees({ commission: 10, intakeFee: 0.5 });
    expect(lines).toEqual([
      '10 % Provision vom Verkaufspreis jedes verkauften Artikels',
      '0,50 € Annahmegebühr pro angenommenem Artikel, auch wenn er nicht verkauft wird',
    ]);
    expect(example).toBe(
      'Beispiel: 10 Artikel abgegeben, 6 für je 5,00 € verkauft: 30,00 € − 3,00 € Provision − 5,00 € Annahmegebühr = 22,00 € für dich.'
    );
  });

  it('says when the fee is higher than the sales', () => {
    expect(describeSellerFees({ commission: 0, intakeFee: 4 }).example).toContain(
      '30,00 € − 40,00 € Annahmegebühr = du zahlst 10,00 €.'
    );
  });

  it('has nothing to explain without fees', () => {
    expect(describeSellerFees({ commission: 0 })).toEqual({ lines: [], example: null });
    expect(describeSellerFees({ commission: 7.5 }).lines[0]).toMatch(/^7,5 % Provision/);
  });
});
