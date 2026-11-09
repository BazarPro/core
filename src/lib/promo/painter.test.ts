import type { jsPDF } from 'jspdf';
import { describe, expect, it } from 'vitest';
import { CanvasPainter, fontWeight, PdfPainter, type TextStyle } from './painter';
import { fakeContext, type Call } from './promoTestUtils';

const style: TextStyle = { family: 'round', weight: 800, size: 20, color: '#112233' };

describe('fontWeight', () => {
  it('takes the nearest weight the font has', () => {
    expect(fontWeight('sans', 900)).toBe(800);
    expect(fontWeight('sans', 500)).toBe(400);
    expect(fontWeight('round', 400)).toBe(500);
    expect(fontWeight('round', 650)).toBe(600);
  });
});

describe('CanvasPainter', () => {
  it('measures with the font of the style, at a large size scaled down', () => {
    const { ctx } = fakeContext();
    expect(new CanvasPainter(ctx).measure('abcd', style)).toBe(40);
    // Small sizes can come out rounded to whole pixels
    expect(ctx.font).toBe("700 100px Fredoka, Inter, 'Helvetica Neue', Arial, sans-serif");
  });

  it('draws text at its place, turned when asked', () => {
    const { ctx, calls } = fakeContext();
    const painter = new CanvasPainter(ctx);
    painter.text('Hallo', 10, 20, style);
    expect(calls).toContainEqual(['translate', 10, 20]);
    expect(calls).toContainEqual(['fillText', 'Hallo', 0, 0]);
    expect(calls).toContainEqual(['set:textAlign', 'left']);
    expect(calls.some((c) => c[0] === 'rotate')).toBe(false);
    painter.text('Hallo', 10, 20, style, { align: 'center', angle: 0.5 });
    expect(calls).toContainEqual(['rotate', 0.5]);
    expect(calls).toContainEqual(['set:textAlign', 'center']);
  });

  it('fills rectangles and circles, with an outline when asked', () => {
    const { ctx, calls } = fakeContext();
    const painter = new CanvasPainter(ctx);
    painter.rect(1, 2, 3, 4, '#f00');
    painter.roundRect(1, 2, 3, 4, 5, '#0f0');
    painter.circle(5, 5, 2, '#00f');
    expect(calls).toContainEqual(['fillRect', 1, 2, 3, 4]);
    expect(calls).toContainEqual(['roundRect', 1, 2, 3, 4, 5]);
    expect(calls).toContainEqual(['arc', 5, 5, 2, 0, Math.PI * 2]);
    expect(calls.some((c) => c[0] === 'stroke')).toBe(false);
    painter.circle(5, 5, 2, '#00f', { color: '#fff', width: 3 });
    expect(calls).toContainEqual(['set:lineWidth', 3]);
    expect(calls).toContainEqual(['stroke']);
  });
});

/** A jsPDF that records calls; text is as wide in mm as it has letters */
function fakeDoc() {
  const calls: Call[] = [];
  const doc = new Proxy(
    {},
    {
      get:
        (_, prop) =>
        (...args: unknown[]) => {
          calls.push([String(prop), ...args]);
          if (prop === 'getTextWidth') return String(args[0]).length;
          return undefined;
        },
    }
  ) as unknown as jsPDF;
  return { doc, calls };
}

describe('PdfPainter', () => {
  // 100 mm wide: 0.1 mm per layout unit, starting at (10, 20) mm
  const make = () => {
    const { doc, calls } = fakeDoc();
    return { painter: new PdfPainter(doc, { x: 10, y: 20 }, 100), calls };
  };

  it('measures in layout units with the font in points', () => {
    const { painter, calls } = make();
    expect(painter.measure('abcd', style)).toBe(40);
    expect(calls).toContainEqual(['setFont', 'Fredoka', '700']);
    const size = calls.find((c) => c[0] === 'setFontSize')![1] as number;
    expect(size).toBeCloseTo(2 / 0.352778);
  });

  it('records the drawing and writes it on flush', () => {
    const { painter, calls } = make();
    painter.rect(0, 0, 100, 50, '#ff0000');
    painter.roundRect(100, 100, 200, 40, 50, '#00ff00');
    painter.circle(500, 500, 10, '#0000ff');
    painter.circle(500, 500, 10, '#0000ff', { color: '#ffffff', width: 5 });
    painter.text('Hallo', 100, 200, style);
    expect(calls.some((c) => c[0] === 'rect')).toBe(false);
    painter.flush();
    expect(calls).toContainEqual(['rect', 10, 20, 10, 5, 'F']);
    // The radius is at most half the height
    expect(calls).toContainEqual(['roundedRect', 20, 30, 20, 4, 2, 2, 'F']);
    expect(calls).toContainEqual(['circle', 60, 70, 1, 'F']);
    expect(calls).toContainEqual(['setDrawColor', '#ffffff']);
    expect(calls).toContainEqual(['setLineWidth', 0.5]);
    expect(calls).toContainEqual(['circle', 60, 70, 1, 'FD']);
    expect(calls).toContainEqual(['setTextColor', '#112233']);
    expect(calls).toContainEqual([
      'text',
      'Hallo',
      20,
      40,
      { baseline: 'alphabetic', angle: undefined },
    ]);
    // Written once only
    const count = calls.length;
    painter.flush();
    expect(calls.length).toBe(count);
  });

  it('centres text by its width and turns it the other way round in degrees', () => {
    const { painter, calls } = make();
    // 'abcd' is 40 units wide: centred on x = 100 it starts at 80
    painter.text('abcd', 100, 200, style, { align: 'center' });
    painter.text('abcd', 100, 200, style, { align: 'center', angle: Math.PI / 2 });
    painter.flush();
    const texts = calls.filter((c) => c[0] === 'text');
    expect(texts[0]![2]).toBeCloseTo(18);
    expect(texts[0]![3]).toBeCloseTo(40);
    expect(texts[1]![2]).toBeCloseTo(20);
    expect(texts[1]![3]).toBeCloseTo(38);
    expect((texts[1]![4] as { angle: number }).angle).toBeCloseTo(-90);
  });
});
