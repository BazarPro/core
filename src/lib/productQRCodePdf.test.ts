import { describe, expect, it, vi } from 'vitest';
import { jsPDF } from 'jspdf';
import type { Id } from './api/types';
import { buildLabelsPdf, downloadLabelsPdf, labelInfoLine, wrapTitle } from './productQRCodePdf';

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
const id = (n: number) => `product${n}` as Id<'products'>;

describe('labels', () => {
  it('info line with size and price', () => {
    const label = { productId: id(1), title: 'Body', sortCode: 17, size: '104', price: 5 };
    expect(labelInfoLine(label)).toBe('Gr. 104 · 5,00 €');
    expect(labelInfoLine({ productId: id(1), title: 'Rad' })).toBe('');
  });

  it('wraps long titles to the given lines and shortens the rest', () => {
    const doc = new jsPDF({ unit: 'mm' });
    doc.setFontSize(8);
    expect(wrapTitle(doc, 'Body', 40, 2)).toEqual(['Body']);
    const lines = wrapTitle(doc, 'Sehr schöne warme Winterjacke mit Kapuze und Fleece', 25, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
    expect(wrapTitle(doc, 'Donaudampfschifffahrtsgesellschaft', 15, 2)[0].endsWith('…')).toBe(true);
  });

  it('fits 40 small or 12 large labels on a page', async () => {
    const labels = Array.from({ length: 41 }, (_, i) => ({
      productId: id(i),
      title: `Artikel ${i}`,
      sortCode: 3,
      size: '98',
    }));
    expect(buildLabelsPdf(labels, 'small').getNumberOfPages()).toBe(2);
    expect(buildLabelsPdf(labels.slice(0, 13), 'standard').getNumberOfPages()).toBe(2);
  });

  it('downloads what the backend returns', async () => {
    const query = vi.fn().mockResolvedValue({
      format: 'small',
      labels: [{ productId: id(1), title: 'Body', sortCode: 1 }],
    });
    const client = { query } as never;
    expect(await downloadLabelsPdf(client, [id(1)], 'event1' as Id<'events'>)).toBe(1);
    expect(query).toHaveBeenCalledWith(expect.anything(), {
      productIds: [id(1)],
      eventId: 'event1',
    });
    expect(save).toHaveBeenCalledWith('BazarPro-Etiketten.pdf');
    expect(await downloadLabelsPdf(client, [])).toBe(0);
  });

  const label = (n: number) => ({ productId: id(n), title: `Teil ${n}`, sortCode: 175 });
  const pages = (doc: ReturnType<typeof buildLabelsPdf>) => doc.getNumberOfPages();

  it('starts on a free place and goes on with a new sheet', () => {
    const labels = Array.from({ length: 3 }, (_, i) => label(i));
    expect(pages(buildLabelsPdf(labels, 'small', 38))).toBe(1);
    expect(pages(buildLabelsPdf(labels, 'small', 39))).toBe(2);
    expect(pages(buildLabelsPdf(labels, 'small', 40))).toBe(2);
    expect(pages(buildLabelsPdf(labels, 'small', 999))).toBe(2);
    expect(pages(buildLabelsPdf(labels, 'small', -3))).toBe(1);
  });

  it('draws the sorting mark in both formats', () => {
    for (const format of ['small', 'standard'] as const) {
      const pdf = buildLabelsPdf([label(1)], format).output();
      // The pile and a basket mark of the code 175
      expect(pdf).toContain('(5) Tj');
      expect(pdf).toContain('(88) Tj');
    }
  });
});
