import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import { MIN_MODULE_MM, drawLabelQr, labelQr, labelUrl, moduleSize } from './labelQr';
import { getSiteUrl } from './seo';

const id = '0199f2a4-7c1e-7b3a-9d2e-5f6a7b8c9d0e';

describe('label QR codes', () => {
  it('link to the product in upper case, which fits the compact alphanumeric mode', () => {
    const site = getSiteUrl();
    expect(labelUrl(id)).toBe(`${site.toUpperCase()}/P/${id.toUpperCase()}`);
    // Ids from Convex times keep their case
    expect(labelUrl('abc123def456ghi789')).toBe(`${site}/p/abc123def456ghi789`);
  });

  it('take as much error correction as the printed size allows', () => {
    const url = `HTTPS://BAZARPRO.DE/P/${id.toUpperCase()}`;
    // Small label (40 per A4 page, ~24.7 mm): less correction keeps the modules readable
    const small = labelQr(url, 24.7);
    expect(small.level).toBe('M');
    expect(moduleSize(small.code, 24.7)).toBeGreaterThanOrEqual(MIN_MODULE_MM);
    // Standard label (~45 mm): the strongest correction still has large modules
    expect(labelQr(url, 45).level).toBe('H');
    // Tiny: the least correction, which has the largest modules
    expect(labelQr(url, 10).level).toBe('L');
  });

  it('are much smaller codes than the long link with high correction used before', () => {
    const before = labelQr(`https://bazarpro.de/products/view/${id}`, 100).code;
    const now = labelQr(`HTTPS://BAZARPRO.DE/P/${id.toUpperCase()}`, 24.7).code;
    expect(before.modules.size).toBe(49);
    expect(now.modules.size).toBe(29);
  });

  it('are drawn as vector rectangles inside the given square', () => {
    const doc = new jsPDF({ unit: 'mm' });
    const rects: number[][] = [];
    doc.rect = ((x: number, y: number, w: number, h: number) => {
      rects.push([x, y, w, h]);
      return doc;
    }) as typeof doc.rect;
    drawLabelQr(doc, 'HTTPS://BAZARPRO.DE/P/X', 10, 20, 30);
    expect(rects.length).toBeGreaterThan(20);
    for (const [x, y, w, h] of rects) {
      expect(x).toBeGreaterThanOrEqual(10);
      expect(y).toBeGreaterThanOrEqual(20);
      expect(x + w).toBeLessThanOrEqual(40);
      expect(y + h).toBeLessThanOrEqual(50.1);
    }
  });
});
