import type { LabelFormat } from '../shared/constants';
import { formatPrice } from './utils';

/**
 * Where everything goes on a printed label, in mm. The PDF (productQRCodePdf.ts) draws it
 * and the app shows it as SVG (components/products/PrintedLabel.tsx), so the labels on the
 * website look exactly like the printed ones. No jsPDF here: the public pages use it too.
 */

/** A4 (210 x 297 mm) with a margin of 10 mm */
export const PAGE_WIDTH = 210;
export const PAGE_HEIGHT = 297;
export const MARGIN_MM = 10;

/** Grid of one page: large labels (e.g. bikes) or small ones for clothes. */
export const LABEL_LAYOUTS: Record<LabelFormat, { cols: number; rows: number }> = {
  standard: { cols: 3, rows: 4 },
  small: { cols: 4, rows: 10 },
};

/** Size of one label in mm */
export function labelSize(format: LabelFormat): { width: number; height: number } {
  const { cols, rows } = LABEL_LAYOUTS[format];
  return {
    width: (PAGE_WIDTH - 2 * MARGIN_MM) / cols,
    height: (PAGE_HEIGHT - 2 * MARGIN_MM) / rows,
  };
}

export interface LabelText {
  productId?: string;
  title: string;
  /** The seller's lasting code for sorting the items back; none on QR-only labels */
  sortCode?: number;
  size?: string;
  /** Only when the bazaar prints prices; with discounts the starting price */
  price?: number;
}

/** "5,00"; prices from 1000 € on are whole euros and go without cents ("1200"). */
export function labelPrice(price: number): string {
  // Narrow on the label: no thousands point ("1200", not "1.200")
  return formatPrice(price, price >= 1000 ? 0 : 2).replace(/[.,](?=\d{3}\b)/g, '');
}

/** "Gr. 104 · 5,00 €" – whatever is known about the item. */
export function labelInfoLine(label: LabelText): string {
  return [
    label.size ? `Gr. ${label.size}` : null,
    label.price !== undefined ? `${labelPrice(label.price)} €` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Width of `text` in mm at `pt` points, Helvetica (bold or not). */
export type MeasureText = (text: string, pt: number, bold: boolean) => number;

/** Shortens text with "…" until it fits. */
function truncate(width: (text: string) => number, text: string, maxWidth: number): string {
  let shortened = text;
  while (shortened.length > 0 && width(`${shortened}…`) > maxWidth) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}…`;
}

/** Splits a title into up to `maxLines` lines; on overflow the last one ends with "…". */
export function wrapText(
  width: (text: string) => number,
  title: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of title.trim().split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (width(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (lines.length === maxLines) {
      lines[maxLines - 1] = truncate(width, lines[maxLines - 1], maxWidth);
      return lines;
    }
    current = width(word) <= maxWidth ? word : truncate(width, word, maxWidth);
  }
  if (current) lines.push(current);
  return lines;
}

/** A text at its baseline; `pt` as in the PDF */
export interface PlacedText {
  text: string;
  x: number;
  y: number;
  pt: number;
  bold: boolean;
  align: 'left' | 'center' | 'right';
}

export interface LabelPlan {
  width: number;
  height: number;
  qr: { x: number; y: number; size: number };
  mark?: { x: number; y: number; width: number; height: number };
  texts: PlacedText[];
}

/** Width to height of the sorting mark on labels */
export const MARK_RATIO = 16.9691 / 10.2;
/** Height of the sorting mark on large labels; the QR code keeps its size */
const MARK_HEIGHT = 10.2;
const MARK_SPACE = 11.5;

/** jsPDF font sizes are in pt, the layout in mm */
export const MM_PER_PT = 0.3528;
const capHeight = (pt: number) => pt * MM_PER_PT * 0.72;

/** Centered from top to bottom: QR code, title, sorting mark, size and price. */
function planStandard(label: LabelText, measure: MeasureText): LabelPlan {
  const { width, height } = labelSize('standard');
  const padding = 2.5;
  const centerX = width / 2;
  const bottom = height - padding;
  const info = labelInfoLine(label);
  const infoHeight = info ? 5 : 0;
  const markSpace = label.sortCode !== undefined ? MARK_SPACE : 0;
  const titleHeight = 8;
  const qrSize = Math.min(
    width - 2 * padding,
    height - 2 * padding - titleHeight - markSpace - infoHeight
  );
  const qrY = padding;
  const texts: PlacedText[] = [];

  const titlePt = 8.5;
  const titleLines = wrapText(
    (text) => measure(text, titlePt, false),
    label.title,
    width - 2 * padding,
    2
  );
  const titleY = qrY + qrSize + (titleHeight - titleLines.length * 3.5) / 2 + 2.6;
  titleLines.forEach((line, i) =>
    texts.push({
      text: line,
      x: centerX,
      y: titleY + i * 3.5,
      pt: titlePt,
      bold: false,
      align: 'center',
    })
  );

  let mark: LabelPlan['mark'];
  if (label.sortCode !== undefined) {
    const markWidth = MARK_HEIGHT * MARK_RATIO;
    mark = {
      x: centerX - markWidth / 2,
      y: qrY + qrSize + titleHeight + (MARK_SPACE - MARK_HEIGHT) / 2,
      width: markWidth,
      height: MARK_HEIGHT,
    };
  }
  if (info) texts.push({ text: info, x: centerX, y: bottom, pt: 10, bold: true, align: 'center' });
  return { width, height, qr: { x: centerX - qrSize / 2, y: qrY, size: qrSize }, mark, texts };
}

/** Largest font size from `size` down to `min` pt at which the text fits into `width`. */
function fitFontSize(
  measure: MeasureText,
  text: string,
  width: number,
  size: number,
  min = 4
): number {
  while (size > min && measure(text, size, true) > width) size -= 0.25;
  return size;
}

/**
 * QR code on the left; on the right the sorting mark, up to two title lines and at the
 * bottom size (large, left) and price (right, without "€"). When both do not fit next to
 * each other, the size moves above the price; the title gives way to them.
 */
function planSmall(label: LabelText, measure: MeasureText): LabelPlan {
  const { width, height } = labelSize('small');
  const padding = 1.5;
  const qrSize = height - 2 * padding;
  const textX = padding + qrSize + 1;
  const right = width - padding;
  const textWidth = right - textX;
  const texts: PlacedText[] = [];

  let markBottom = padding;
  let mark: LabelPlan['mark'];
  if (label.sortCode !== undefined) {
    const markHeight = Math.min(textWidth / MARK_RATIO, height / 2);
    mark = { x: textX, y: markBottom, width: markHeight * MARK_RATIO, height: markHeight };
    markBottom += markHeight;
  }

  const baseline = height - padding - 0.3;
  const size = label.size;
  const price = label.price !== undefined ? labelPrice(label.price) : undefined;
  const sizePt = 13;
  // Big enough to read in the crowd at a kids' bazaar (#327)
  const pricePt = 11;
  const gap = 2;
  const widthAt = (text: string, pt: number) => measure(text, pt, true);
  // 10 % reserve, so the row does not touch when a printer driver swaps the font
  const inRow =
    !size || !price || (widthAt(size, sizePt) + widthAt(price, pricePt)) * 1.1 + gap <= textWidth;
  let top = baseline;
  if (price) {
    const pt = fitFontSize(measure, price, textWidth, pricePt);
    texts.push({ text: price, x: right, y: baseline, pt, bold: true, align: 'right' });
    top = baseline - capHeight(pt);
  }
  if (size && inRow) {
    const room = price ? textWidth - widthAt(price, pricePt) - gap : textWidth;
    const pt = fitFontSize(measure, size, room, sizePt);
    texts.push({ text: size, x: textX, y: baseline, pt, bold: true, align: 'left' });
    top = Math.min(top, baseline - capHeight(pt));
  } else if (size) {
    const sizeBaseline = top - 1;
    const pt = fitFontSize(measure, size, textWidth, sizePt * 0.85);
    texts.push({ text: size, x: textX, y: sizeBaseline, pt, bold: true, align: 'left' });
    top = sizeBaseline - capHeight(pt);
  }

  const titlePt = 6.5;
  const lineHeight = 2.45;
  const firstLine = markBottom + 2.6;
  const titleWidth = (text: string) => measure(text, titlePt, false);
  let maxLines = 2;
  let lines = wrapText(titleWidth, label.title, textWidth, maxLines);
  while (lines.length > 0 && firstLine + (lines.length - 1) * lineHeight + 0.6 > top - 0.6) {
    lines = maxLines > 1 ? wrapText(titleWidth, label.title, textWidth, --maxLines) : [];
  }
  lines.forEach((line, i) =>
    texts.push({
      text: line,
      x: textX,
      y: firstLine + i * lineHeight,
      pt: titlePt,
      bold: false,
      align: 'left',
    })
  );
  return { width, height, qr: { x: padding, y: padding, size: qrSize }, mark, texts };
}

/** Everything on one label, relative to its upper left corner. */
export function planLabel(label: LabelText, format: LabelFormat, measure: MeasureText): LabelPlan {
  return format === 'small' ? planSmall(label, measure) : planStandard(label, measure);
}
