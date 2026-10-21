import { describe, expect, it } from 'vitest';
import type { Id } from '../../convex/_generated/dataModel';
import type { ProofItem } from '../../convex/sellerRecords';
import { buildProofOfOffersPdf, proofOfOffersCsv, proofRows } from './proofOfOffersPdf';

const item = (overrides: Partial<ProofItem> = {}): ProofItem => ({
  productId: 'p1' as Id<'products'>,
  title: 'Trekkingrad',
  category: 'Fahrräder',
  attributes: [{ label: 'Rahmennummer', text: 'frameNumber', value: 'WBK123' }],
  price: 150,
  status: 'sold',
  soldFor: 140,
  soldAt: Date.UTC(2026, 9, 17, 9),
  seller: {
    sellerNumber: 7,
    firstName: 'Anna',
    lastName: 'Rad',
    street: 'Münsterplatz 1',
    zipCode: '89073',
    city: 'Ulm',
    phone: '0731 123',
    fromRecord: true,
  },
  ...overrides,
});
const proof = (items: ProofItem[]) => ({
  event: { title: 'Fahrradmarkt', location: 'Ulm', startDate: 0, endDate: 0 },
  items,
});

describe('record of offered items', () => {
  it('has one row per item with seller, address, details and sale', () => {
    const [row] = proofRows([item()]);
    expect(row.slice(0, 7)).toEqual([
      '7',
      'Anna Rad',
      'Münsterplatz 1, 89073 Ulm',
      '0731 123',
      'Trekkingrad',
      'Fahrräder · Rahmennummer: WBK123',
      '150,00 €',
    ]);
    expect(row[7]).toMatch(/^verkauft für 140,00 € am /);
    expect(proofRows([item({ soldFor: undefined, soldAt: undefined })])[0][7]).toBe(
      'nicht verkauft'
    );
  });

  it('writes a CSV that spreadsheets open, with quoted cells where needed', () => {
    const csv = proofOfOffersCsv(proof([item({ title: 'Rad; "Cube"' })]));
    expect(csv.startsWith('\uFEFFNr.;Verkäufer;Anschrift')).toBe(true);
    expect(csv).toContain(';"Rad; ""Cube""";');
  });

  it('builds a PDF that grows to more pages with many items', () => {
    expect(buildProofOfOffersPdf(proof([item()])).getNumberOfPages()).toBe(1);
    const many = Array.from({ length: 80 }, (_, i) => item({ title: `Rad ${i}` }));
    expect(buildProofOfOffersPdf(proof(many)).getNumberOfPages()).toBeGreaterThan(1);
  });
});
