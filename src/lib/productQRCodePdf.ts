import { jsPDF } from 'jspdf';
import * as QRCode from 'qrcode';
import type { ApiClient } from './api/client';
import { api } from './api/functions';
import type { Id } from '../../convex/_generated/dataModel';
import type { LabelFormat } from '../../convex/constants';
import { formatPriceDE, getProductUrl } from './utils';

/** Layout in mm on A4 (210 x 297 mm) */
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN_MM = 10;

/** Grid of one page: large labels (e.g. bikes) or small ones for clothes. */
export const LABEL_LAYOUTS: Record<LabelFormat, { cols: number; rows: number }> = {
  standard: { cols: 3, rows: 4 },
  small: { cols: 4, rows: 10 },
};

export interface LabelData {
  productId: Id<'products'>;
  title: string;
  /** Seller number at the bazaar, for sorting the items back after the sale */
  sellerNumber?: number;
  size?: string;
  /** Only when the bazaar prints prices (and has no discounts) */
  price?: number;
}

/** "Nr. 17 · Gr. 104 · 5,00 €" – whatever is known about the item. */
export function labelInfoLine(label: LabelData, withNumber = true): string {
  return [
    withNumber && label.sellerNumber !== undefined ? `Nr. ${label.sellerNumber}` : null,
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

async function qrDataUrl(productId: Id<'products'>): Promise<string> {
  return QRCode.toDataURL(getProductUrl(productId), {
    width: 256,
    margin: 1,
    errorCorrectionLevel: 'H',
  });
}

interface Cell {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** QR code on top, title and "Nr. · Gr. · Preis" below. */
function drawStandard(doc: jsPDF, qr: string, label: LabelData, cell: Cell): void {
  const padding = 2;
  const qrSize = Math.min(cell.width, cell.height - 20) - 4;
  const qrY = cell.y + padding;
  doc.addImage(qr, 'PNG', cell.x + (cell.width - qrSize) / 2, qrY, qrSize, qrSize);

  const centerX = cell.x + cell.width / 2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const titleLines = wrapTitle(doc, label.title, cell.width - 2 * padding, 2);
  titleLines.forEach((line, i) => {
    doc.text(line, centerX, qrY + qrSize + 3 + i * 4, { align: 'center' });
  });

  const info = labelInfoLine(label);
  if (info) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(info, centerX, qrY + qrSize + 4.5 + titleLines.length * 4, { align: 'center' });
  }
}

/** QR code on the left, large seller number, title and size/price on the right. */
function drawSmall(doc: jsPDF, qr: string, label: LabelData, cell: Cell): void {
  const padding = 1.5;
  const qrSize = cell.height - 2 * padding;
  doc.addImage(qr, 'PNG', cell.x + padding, cell.y + padding, qrSize, qrSize);

  const textX = cell.x + padding + qrSize + 1.5;
  const textWidth = cell.x + cell.width - padding - textX;
  let lineY = cell.y + padding + 4;
  if (label.sellerNumber !== undefined) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(`Nr. ${label.sellerNumber}`, textX, lineY);
    lineY += 4.5;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  for (const line of wrapTitle(doc, label.title, textWidth, 2)) {
    doc.text(line, textX, lineY);
    lineY += 3;
  }
  const info = labelInfoLine(label, false);
  if (info) {
    doc.setFont('helvetica', 'bold');
    let size = 8;
    doc.setFontSize(size);
    while (size > 5 && doc.getTextWidth(info) > textWidth) doc.setFontSize((size -= 0.5));
    doc.text(info, textX, Math.min(lineY + 1, cell.y + cell.height - padding));
  }

  // Light cut lines between the small labels
  doc.setDrawColor(210);
  doc.setLineWidth(0.1);
  doc.rect(cell.x, cell.y, cell.width, cell.height);
}

/** A4 pages with one label per item in the given format. */
export async function buildLabelsPdf(labels: LabelData[], format: LabelFormat): Promise<jsPDF> {
  const { cols, rows } = LABEL_LAYOUTS[format];
  const width = (PAGE_WIDTH - 2 * MARGIN_MM) / cols;
  const height = (PAGE_HEIGHT - 2 * MARGIN_MM) / rows;
  const perPage = cols * rows;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setTextColor(0, 0, 0);

  for (const [i, label] of labels.entries()) {
    if (i > 0 && i % perPage === 0) doc.addPage();
    const index = i % perPage;
    const cell = {
      x: MARGIN_MM + (index % cols) * width,
      y: MARGIN_MM + Math.floor(index / cols) * height,
      width,
      height,
    };
    const qr = await qrDataUrl(label.productId);
    if (format === 'small') drawSmall(doc, qr, label, cell);
    else drawStandard(doc, qr, label, cell);
  }
  return doc;
}

/**
 * Loads what goes on the labels (seller number, size, price and the label sheet
 * of the bazaar) and downloads the PDF. With `eventId` the labels are for that bazaar.
 */
export async function downloadLabelsPdf(
  convex: ApiClient,
  productIds: Id<'products'>[],
  eventId?: Id<'events'>
): Promise<number> {
  if (productIds.length === 0) return 0;
  const data = await convex.query(api.labels.getLabelData, { productIds, eventId });
  if (data.labels.length === 0) return 0;
  const doc = await buildLabelsPdf(data.labels, data.format);
  doc.save('BazarPro-Etiketten.pdf');
  return data.labels.length;
}
