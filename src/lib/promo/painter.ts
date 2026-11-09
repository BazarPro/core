import type { jsPDF } from 'jspdf';

/**
 * Where the promo layout draws its text and shapes: the canvas of the preview and the PNG,
 * or a PDF with real text and vector shapes, sharp at any size. Photos and color gradients
 * are not drawn here but on a canvas underneath (renderPromo).
 *
 * All coordinates are layout units: the page is 1000 units wide.
 */

export type FontFamily = 'sans' | 'round';

export interface TextStyle {
  family: FontFamily;
  weight: number;
  /** Font size in layout units */
  size: number;
  color: string;
}

export interface Painter {
  measure(text: string, style: TextStyle): number;
  /**
   * Text on the baseline at (x, y). `angle` turns it clockwise around (x, y), in radians.
   * With align center, x is the middle of the text.
   */
  text(
    text: string,
    x: number,
    y: number,
    style: TextStyle,
    options?: { align?: 'left' | 'center'; angle?: number }
  ): void;
  rect(x: number, y: number, w: number, h: number, color: string): void;
  roundRect(x: number, y: number, w: number, h: number, r: number, color: string): void;
  circle(
    cx: number,
    cy: number,
    r: number,
    color: string,
    stroke?: { color: string; width: number }
  ): void;
}

/** The weights the bundled fonts have; others take the nearest one */
const WEIGHTS: Record<FontFamily, number[]> = {
  sans: [400, 700, 800],
  round: [500, 600, 700],
};

export function fontWeight(family: FontFamily, weight: number): number {
  return WEIGHTS[family].reduce((best, w) =>
    Math.abs(w - weight) < Math.abs(best - weight) ? w : best
  );
}

const CSS_FAMILY: Record<FontFamily, string> = {
  sans: "Inter, 'Helvetica Neue', Arial, sans-serif",
  round: "Fredoka, Inter, 'Helvetica Neue', Arial, sans-serif",
};

export const PDF_FAMILY: Record<FontFamily, string> = { sans: 'Inter', round: 'Fredoka' };

/** Font size text is measured at, in px */
const MEASURE_SIZE = 100;

const cssFont = (style: TextStyle) =>
  `${fontWeight(style.family, style.weight)} ${style.size}px ${CSS_FAMILY[style.family]}`;

/** Draws on a 2D canvas whose transform already maps layout units to pixels. */
export class CanvasPainter implements Painter {
  private readonly ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  /**
   * Measured at one large size and scaled: at small sizes some browsers (Firefox on
   * Android) round the widths to whole pixels, so lines wrap sooner and the page
   * reports too much text although the same text fits elsewhere.
   */
  measure(text: string, style: TextStyle): number {
    const { ctx } = this;
    ctx.font = cssFont({ ...style, size: MEASURE_SIZE });
    return (ctx.measureText(text).width * style.size) / MEASURE_SIZE;
  }

  text(
    text: string,
    x: number,
    y: number,
    style: TextStyle,
    options: { align?: 'left' | 'center'; angle?: number } = {}
  ) {
    const { ctx } = this;
    ctx.save();
    ctx.font = cssFont(style);
    ctx.fillStyle = style.color;
    ctx.textAlign = options.align ?? 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.translate(x, y);
    if (options.angle) ctx.rotate(options.angle);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  rect(x: number, y: number, w: number, h: number, color: string) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
  }

  roundRect(x: number, y: number, w: number, h: number, r: number, color: string) {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.roundRect(x, y, w, h, r);
    this.ctx.fill();
  }

  circle(
    cx: number,
    cy: number,
    r: number,
    color: string,
    stroke?: { color: string; width: number }
  ) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.stroke();
    }
  }
}

/**
 * Writes into a jsPDF document in mm. The drawing is recorded and written by `flush`, so
 * the photo canvas can go underneath first. Needs the fonts of `registerPromoFonts`.
 */
export class PdfPainter implements Painter {
  private readonly doc: jsPDF;
  /** mm per layout unit */
  private readonly k: number;
  private readonly x0: number;
  private readonly y0: number;
  private readonly ops: (() => void)[] = [];

  constructor(doc: jsPDF, origin: { x: number; y: number }, widthMm: number) {
    this.doc = doc;
    this.k = widthMm / 1000;
    this.x0 = origin.x;
    this.y0 = origin.y;
  }

  private X(x: number) {
    return this.x0 + x * this.k;
  }

  private Y(y: number) {
    return this.y0 + y * this.k;
  }

  private font(style: TextStyle) {
    this.doc.setFont(PDF_FAMILY[style.family], String(fontWeight(style.family, style.weight)));
    // jsPDF sizes fonts in points
    this.doc.setFontSize((style.size * this.k) / 0.352778);
  }

  measure(text: string, style: TextStyle): number {
    this.font(style);
    return this.doc.getTextWidth(text) / this.k;
  }

  text(
    text: string,
    x: number,
    y: number,
    style: TextStyle,
    options: { align?: 'left' | 'center'; angle?: number } = {}
  ) {
    const angle = options.angle ?? 0;
    let left = x;
    let top = y;
    if (options.align === 'center') {
      const half = this.measure(text, style) / 2;
      left = x - half * Math.cos(angle);
      top = y - half * Math.sin(angle);
    }
    this.ops.push(() => {
      this.font(style);
      this.doc.setTextColor(style.color);
      // jsPDF turns counter-clockwise, in degrees
      this.doc.text(text, this.X(left), this.Y(top), {
        baseline: 'alphabetic',
        angle: angle ? (-angle * 180) / Math.PI : undefined,
      });
    });
  }

  rect(x: number, y: number, w: number, h: number, color: string) {
    this.ops.push(() => {
      this.doc.setFillColor(color);
      this.doc.rect(this.X(x), this.Y(y), w * this.k, h * this.k, 'F');
    });
  }

  roundRect(x: number, y: number, w: number, h: number, r: number, color: string) {
    this.ops.push(() => {
      this.doc.setFillColor(color);
      const radius = Math.min(r, w / 2, h / 2) * this.k;
      this.doc.roundedRect(this.X(x), this.Y(y), w * this.k, h * this.k, radius, radius, 'F');
    });
  }

  circle(
    cx: number,
    cy: number,
    r: number,
    color: string,
    stroke?: { color: string; width: number }
  ) {
    this.ops.push(() => {
      this.doc.setFillColor(color);
      if (stroke) {
        this.doc.setDrawColor(stroke.color);
        this.doc.setLineWidth(stroke.width * this.k);
      }
      this.doc.circle(this.X(cx), this.Y(cy), r * this.k, stroke ? 'FD' : 'F');
    });
  }

  flush() {
    for (const op of this.ops.splice(0)) op();
  }
}
