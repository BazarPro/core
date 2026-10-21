import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Id } from './api/types';
import type { ProofItem } from './api/types';
import {
  buildProofOfOffersPdf,
  downloadProofOfOffersCsv,
  downloadProofOfOffersPdf,
  proofOfOffersCsv,
  proofRows,
} from './proofOfOffersPdf';

const save = vi.hoisted(() => vi.fn());
// save() is set per document, so it is replaced in the constructor
vi.mock('jspdf', async (importOriginal) => {
  const original = await importOriginal<typeof import('jspdf')>();
  class TestPdf extends original.jsPDF {
    constructor(...args: ConstructorParameters<typeof original.jsPDF>) {
      super(...args);
      this.save = save;
    }
  }
  return { ...original, jsPDF: TestPdf };
});

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

describe('downloads', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('names the files after the bazaar and fills gaps with dashes', () => {
    const bare = item({
      soldFor: undefined,
      soldAt: undefined,
      category: undefined as never,
      attributes: [],
      seller: { fromRecord: false } as ProofItem['seller'],
    });
    downloadProofOfOffersPdf(proof([bare]));
    expect(save.mock.calls[0][0]).toMatch(/-Fahrradmarkt\.pdf$/);
    expect(proofRows([bare])[0].slice(0, 4)).toEqual(['–', '–', '–', '–']);

    const click = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue({ click } as never);
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:1', revokeObjectURL: vi.fn() });
    downloadProofOfOffersCsv({ ...proof([]), event: { ...proof([]).event, title: '!!!' } });
    expect(click).toHaveBeenCalled();
  });

  it('sold items without a date still show the price', () => {
    expect(proofRows([item({ soldAt: undefined })])[0].join(' ')).toContain('140,00');
  });
});
