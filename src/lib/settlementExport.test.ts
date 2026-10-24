import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SettlementExport, SettlementSale, SettlementSeller } from './api/types';
import {
  buildSettlementPdf,
  downloadSettlementCsv,
  downloadSettlementPdf,
  saleRows,
  salesCsv,
  sellerRows,
  sellersCsv,
} from './settlementExport';

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

const seller = (overrides: Partial<SettlementSeller> = {}): SettlementSeller => ({
  sellerNumber: 7,
  firstName: 'Anna',
  lastName: 'Rad',
  street: 'Münsterplatz 1',
  zipCode: '89073',
  city: 'Ulm',
  revenue: 140,
  commission: 14,
  intakeFee: 1.5,
  payout: 124.5,
  paid: true,
  ...overrides,
});
const sale = (overrides: Partial<SettlementSale> = {}): SettlementSale => ({
  soldAt: Date.UTC(2026, 9, 17, 9),
  title: 'Trekkingrad',
  category: 'Fahrräder',
  sellerNumber: 7,
  listPrice: 150,
  totalAmount: 140,
  priceSource: 'offer',
  commission: 14,
  payout: 126,
  ...overrides,
});
const settlement = (sellers: SettlementSeller[], sales: SettlementSale[]): SettlementExport => ({
  event: { title: 'Fahrradmarkt', location: 'Ulm', startDate: 0, endDate: 0, commission: 10 },
  sellers,
  sales,
});

describe('settlement export', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('has one row per seller with address, totals and payout', () => {
    expect(sellerRows([seller()])[0]).toEqual([
      '7',
      'Anna Rad',
      'Münsterplatz 1, 89073 Ulm',
      '140,00',
      '14,00',
      '1,50',
      '124,50',
      'ja',
    ]);
    expect(sellerRows([seller({ sellerNumber: undefined, paid: false, payout: -3 })])[0]).toEqual(
      expect.arrayContaining(['–', '-3,00', 'nein'])
    );
  });

  it('has one row per sale with prices and where the price came from', () => {
    const [row] = saleRows([sale()]);
    expect(row.slice(1)).toEqual([
      '7',
      'Trekkingrad',
      'Fahrräder',
      '150,00',
      '140,00',
      'Preisvorschlag',
      '14,00',
      '126,00',
    ]);
  });

  it('writes two CSV tables that spreadsheets open', () => {
    const data = settlement([seller()], [sale({ title: 'Rad; "Cube"' })]);
    expect(sellersCsv(data).startsWith('\uFEFFNr.;Verkäufer;Anschrift;Umsatz (€)')).toBe(true);
    expect(salesCsv(data)).toContain(';"Rad; ""Cube""";');
  });

  it('builds a PDF with both tables that grows to more pages', () => {
    expect(buildSettlementPdf(settlement([seller()], [sale()])).getNumberOfPages()).toBe(1);
    const many = Array.from({ length: 80 }, (_, i) => sale({ title: `Rad ${i}` }));
    expect(buildSettlementPdf(settlement([seller()], many)).getNumberOfPages()).toBeGreaterThan(1);
  });

  it('names the files after the bazaar', async () => {
    await downloadSettlementPdf(settlement([], []));
    expect(save.mock.calls[0][0]).toBe('Abrechnung-Fahrradmarkt.pdf');

    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:1', revokeObjectURL: vi.fn() });
    await downloadSettlementCsv(settlement([], []), 'sales');
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe(
      'Abrechnung-Verkaeufe-Fahrradmarkt.csv'
    );
  });
});
