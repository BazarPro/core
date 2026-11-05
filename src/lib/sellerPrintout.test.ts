import { describe, expect, it, vi } from 'vitest';
import {
  buildSellerPrintoutPdf,
  downloadSellerPrintout,
  itemHeaders,
  itemRows,
  settlementRows,
  settlementTotal,
  type SellerPrintout,
  type SellerPrintoutItem,
} from './sellerPrintout';

const save = vi.hoisted(() => vi.fn());
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

const categories = [
  { _id: 'clothes', label: 'Kleidung' },
  { _id: 'other', label: 'Sonstiges' },
];
const item = (overrides: Partial<SellerPrintoutItem> = {}): SellerPrintoutItem => ({
  title: 'Winterjacke',
  price: 12.5,
  status: 'available',
  productCategory: 'clothes',
  ...overrides,
});
const printout = (overrides: Partial<SellerPrintout> = {}): SellerPrintout => ({
  event: { title: 'Kinderbasar', location: 'Ulm', startDate: 0, commission: 10 },
  seller: {
    firstName: 'Anna',
    lastName: 'Rad',
    street: 'Münsterplatz 1',
    zipCode: '89073',
    city: 'Ulm',
    sellerNumber: 7,
    totalRevenue: 20,
    commission: 2,
    intakeFee: { perItem: 0.5, items: 3, total: 1.5 },
    payout: 16.5,
    paid: false,
  },
  items: [item(), item({ status: 'sold', sale: { totalAmount: 20 } })],
  categories,
  ...overrides,
});

describe('seller printouts', () => {
  it('lists name, category, details, price and state of each item', () => {
    expect(itemHeaders()).toEqual(['Artikel', 'Kategorie', 'Angaben', 'Preis (€)', 'Status']);
    const rows = itemRows(
      [
        item(),
        item({ status: 'sold', sale: { totalAmount: 10 } }),
        item({ status: 'sold' }),
        item({ status: 'announced', productCategory: 'unknown' }),
        item({ status: 'returned' }),
      ],
      categories
    );
    expect(rows[0]).toEqual(['Winterjacke', 'Kleidung', '–', '12,50', 'Nicht verkauft']);
    expect(rows[1][4]).toBe('Verkauft für 10,00 €');
    expect(rows[2][4]).toBe('Verkauft');
    expect(rows[3].slice(1, 2)).toEqual(['–']);
    expect(rows[3][4]).toBe('Nicht abgegeben');
    expect(rows[4][4]).toBe('Zurückgegeben');
  });

  it('shows the same settlement as the screen', () => {
    expect(settlementRows(printout())).toEqual([
      ['Verkauft (1 Artikel)', '20,00 €'],
      ['Provision (10 %)', '-2,00 €'],
      ['Annahmegebühr (3 × 0,50 €)', '-1,50 €'],
    ]);
    expect(settlementTotal(printout())).toEqual(['Auszahlung', '16,50 €']);
  });

  it('leaves out an intake fee of nothing', () => {
    const base = printout();
    const rows = settlementRows({
      ...base,
      seller: { ...base.seller, intakeFee: { perItem: 0, items: 0, total: 0 } },
    });
    expect(rows).toHaveLength(2);
  });

  it('names the seller when they owe the bazaar', () => {
    const base = printout();
    const total = settlementTotal({ ...base, seller: { ...base.seller, payout: -3 } });
    expect(total).toEqual(['Anna Rad zahlt', '3,00 €']);
  });

  it('builds both PDFs, and the list grows to more pages', () => {
    const many = printout({ items: Array.from({ length: 120 }, () => item()) });
    expect(buildSellerPrintoutPdf('items', many).getNumberOfPages()).toBeGreaterThan(1);
    const settlement = buildSellerPrintoutPdf('settlement', printout());
    const content = settlement.output();
    expect(content).toContain('Abrechnung: Kinderbasar');
    expect(content).toContain('Auszahlung');
    expect(content).toContain('Winterjacke');
    expect(content).toContain('Noch nicht abgerechnet');
    expect(buildSellerPrintoutPdf('items', printout()).output()).not.toContain('Auszahlung');
  });

  it('saves the file under the name of the seller', async () => {
    await downloadSellerPrintout('items', printout());
    expect(save).toHaveBeenCalledWith('Artikelliste-Anna-Rad.pdf');
  });
});
