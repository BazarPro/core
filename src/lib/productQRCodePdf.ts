import { jsPDF } from 'jspdf';
import type { ApiClient } from './api/client';
import { api } from './api/functions';
import type { Id } from './api/types';
import type { LabelFormat } from '../shared/constants';
import { drawLabelQr, labelUrl } from './qrCode';
import { drawSortMark } from './sortMarkPdf';
import { formatPriceDE } from './utils';
import { savePdf } from './saveFile';

/** Layout in mm on A4 (210 x 297 mm) */
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN_MM = 10;

/** MAX_LABELS in backend/src/modules/labels.rs */
const LABELS_PER_REQUEST = 500;

/** Grid of one page: large labels (e.g. bikes) or small ones for clothes. */
export const LABEL_LAYOUTS: Record<LabelFormat, { cols: number; rows: number }> = {
  standard: { cols: 3, rows: 4 },
  small: { cols: 4, rows: 10 },
};

export interface LabelData {
  productId: Id<'products'>;
  title: string;
  /** The seller's lasting code for sorting the items back; none on QR-only labels */
  sortCode?: number;
  size?: string;
  /** Only when the bazaar prints prices (and has no discounts) */
  price?: number;
}

/** "Gr. 104 · 5,00 €" – whatever is known about the item. */
export function labelInfoLine(label: LabelData): string {
  return [
    label.size ? `Gr. ${label.size}` : null,
    label.price !== undefined ? `${formatPriceDE(label.price)} €` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Shortens text with "…" until it fits. */
function truncate(doc: jsPDF, text: string, maxWidthMm: number): string {
  let shortened = text;
  while (shortened.length > 0 && doc.getTextWidth(`${shortened}…`) > maxWidthMm) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}…`;
}

/** Splits a title into up to `maxLines` lines; on overflow the last one ends with "…". */
export function wrapTitle(
  doc: jsPDF,
  title: string,
  maxWidthMm: number,
  maxLines: number
): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of title.trim().split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (doc.getTextWidth(candidate) <= maxWidthMm) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (lines.length === maxLines) {
      lines[maxLines - 1] = truncate(doc, lines[maxLines - 1], maxWidthMm);
      return lines;
    }
    current = doc.getTextWidth(word) <= maxWidthMm ? word : truncate(doc, word, maxWidthMm);
  }
  if (current) lines.push(current);
  return lines;
}

interface Cell {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Width to height of the sorting mark on labels */
const MARK_RATIO = 18.3 / 11;

function drawCutLines(doc: jsPDF, cell: Cell): void {
  doc.setDrawColor(130);
  doc.setLineWidth(0.2);
  doc.rect(cell.x, cell.y, cell.width, cell.height);
}

/** Centered from top to bottom: QR code, title, sorting mark, size and price. */
function drawStandard(doc: jsPDF, label: LabelData, cell: Cell): void {
  const padding = 2.5;
  const centerX = cell.x + cell.width / 2;
  const bottom = cell.y + cell.height - padding;
  const info = labelInfoLine(label);
  const infoHeight = info ? 5 : 0;
  const markHeight = label.sortCode !== undefined ? 11.5 : 0;
  const titleHeight = 8;
  const qrSize = Math.min(
    cell.width - 2 * padding,
    cell.height - 2 * padding - titleHeight - markHeight - infoHeight
  );
  const qrY = cell.y + padding;
  drawLabelQr(doc, labelUrl(label.productId), centerX - qrSize / 2, qrY, qrSize);

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const titleLines = wrapTitle(doc, label.title, cell.width - 2 * padding, 2);
  const titleY = qrY + qrSize + (titleHeight - titleLines.length * 3.5) / 2 + 2.6;
  titleLines.forEach((line, i) => {
    doc.text(line, centerX, titleY + i * 3.5, { align: 'center' });
  });

  if (label.sortCode !== undefined) {
    const markWidth = markHeight * MARK_RATIO;
    const markY = qrY + qrSize + titleHeight;
    drawSortMark(doc, label.sortCode, centerX - markWidth / 2, markY, markWidth, markHeight);
  }
  if (info) {
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(info, centerX, bottom, { align: 'center' });
  }
  drawCutLines(doc, cell);
}

/** QR code on the left; sorting mark, title and size/price on the right. */
function drawSmall(doc: jsPDF, label: LabelData, cell: Cell): void {
  const padding = 1.5;
  const qrSize = cell.height - 2 * padding;
  drawLabelQr(doc, labelUrl(label.productId), cell.x + padding, cell.y + padding, qrSize);

  const textX = cell.x + padding + qrSize + 1;
  const textWidth = cell.x + cell.width - padding - textX;
  let lineY = cell.y + padding + 3;
  if (label.sortCode !== undefined) {
    const markHeight = textWidth / MARK_RATIO;
    drawSortMark(doc, label.sortCode, textX, cell.y + padding, textWidth, markHeight);
    lineY = cell.y + padding + markHeight + 3;
  }
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  for (const line of wrapTitle(doc, label.title, textWidth, 2)) {
    doc.text(line, textX, lineY);
    lineY += 2.8;
  }
  const info = labelInfoLine(label);
  if (info) {
    doc.setFont('helvetica', 'bold');
    let size = 8;
    doc.setFontSize(size);
    while (size > 5 && doc.getTextWidth(info) > textWidth) doc.setFontSize((size -= 0.5));
    doc.text(info, textX, cell.y + cell.height - padding - 0.3);
  }
  drawCutLines(doc, cell);
}

/** Says below the labels where to cut. */
function drawCutHint(doc: jsPDF): void {
  doc.setTextColor(110);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Entlang der grauen Linien ausschneiden', PAGE_WIDTH / 2, PAGE_HEIGHT - 4, {
    align: 'center',
  });
}

/**
 * A4 pages with one label per item in the given format. `startAt`: the first free place on
 * a sheet that is partly used, counted from 1 row by row.
 */
export function buildLabelsPdf(
  labels: LabelData[],
  format: LabelFormat,
  startAt = 1,
  compress = true
): jsPDF {
  const { cols, rows } = LABEL_LAYOUTS[format];
  const width = (PAGE_WIDTH - 2 * MARGIN_MM) / cols;
  const height = (PAGE_HEIGHT - 2 * MARGIN_MM) / rows;
  const perPage = cols * rows;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress });
  doc.setTextColor(0, 0, 0);

  const skipped = Math.min(Math.max(Math.trunc(startAt) || 1, 1), perPage) - 1;
  for (const [i, label] of labels.entries()) {
    const place = i + skipped;
    if (i > 0 && place % perPage === 0) {
      drawCutHint(doc);
      doc.addPage();
    }
    const index = place % perPage;
    const cell = {
      x: MARGIN_MM + (index % cols) * width,
      y: MARGIN_MM + Math.floor(index / cols) * height,
      width,
      height,
    };
    if (format === 'small') drawSmall(doc, label, cell);
    else drawStandard(doc, label, cell);
  }
  drawCutHint(doc);
  return doc;
}

/**
 * The one way to labels: loads what goes on them (sorting code, size, price and the label
 * sheet of the bazaar) and downloads the PDF. With `eventId` the labels are for that bazaar.
 */
export async function downloadLabelsPdf(
  client: ApiClient,
  productIds: Id<'products'>[],
  eventId?: Id<'events'>,
  startAt = 1
): Promise<number> {
  if (productIds.length === 0) return 0;
  const labels: LabelData[] = [];
  const formats = new Set<LabelFormat>();
  // The backend answers for a limited number of items at once
  for (let i = 0; i < productIds.length; i += LABELS_PER_REQUEST) {
    const data = await client.query(api.labels.getLabelData, {
      productIds: productIds.slice(i, i + LABELS_PER_REQUEST),
      eventId,
    });
    if (data.labels.length > 0) formats.add(data.format);
    labels.push(...data.labels);
  }
  if (labels.length === 0) return 0;
  // Items of bazaars with different sheets: the large labels
  const format = formats.size === 1 ? [...formats][0] : 'standard';
  await savePdf(buildLabelsPdf(labels, format, startAt), 'BazarPro-Etiketten.pdf');
  return labels.length;
}
