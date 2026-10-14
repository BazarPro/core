import { describe, expect, it, vi } from 'vitest';
import { jsPDF } from 'jspdf';
import type { Id } from '../../convex/_generated/dataModel';
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
vi.mock('qrcode', () => ({
  toDataURL: vi.fn(
    async () =>
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  ),
}));

const id = (n: number) => `product${n}` as Id<'products'>;

describe('labels', () => {
  it('info line with seller number, size and price', () => {
    const label = { productId: id(1), title: 'Body', sellerNumber: 17, size: '104', price: 5 };
    expect(labelInfoLine(label)).toBe('Nr. 17 · Gr. 104 · 5,00 €');
    expect(labelInfoLine(label, false)).toBe('Gr. 104 · 5,00 €');
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
      sellerNumber: 3,
      size: '98',
    }));
    expect((await buildLabelsPdf(labels, 'small')).getNumberOfPages()).toBe(2);
    expect((await buildLabelsPdf(labels.slice(0, 13), 'standard')).getNumberOfPages()).toBe(2);
  });

  it('downloads what the backend returns', async () => {
    const query = vi.fn().mockResolvedValue({
      format: 'small',
      labels: [{ productId: id(1), title: 'Body', sellerNumber: 1 }],
    });
    const convex = { query } as never;
    expect(await downloadLabelsPdf(convex, [id(1)], 'event1' as Id<'events'>)).toBe(1);
    expect(query).toHaveBeenCalledWith(expect.anything(), {
      productIds: [id(1)],
      eventId: 'event1',
    });
    expect(save).toHaveBeenCalledWith('BazarPro-Etiketten.pdf');
    expect(await downloadLabelsPdf(convex, [])).toBe(0);
  });
});
