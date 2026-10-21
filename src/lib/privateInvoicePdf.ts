import { jsPDF } from 'jspdf';
import type { Id } from './api/types';
import { formatPriceDE } from './utils';
import type { InvoiceCopy, PriceLine } from './saleBreakdown';
import i18n from '../i18n';
import { dateLocale } from '../i18n/format';

const PDF_FONT_FAMILY = 'helvetica';
const PDF_TEXT_COLOR_LIGHT: [number, number, number] = [124, 124, 124];
const PDF_TEXT_COLOR_DARK: [number, number, number] = [50, 50, 50];
const PDF_LINE_COLOR: [number, number, number] = [124, 124, 124];

type PrivateInvoicePdfInput = {
  eventId?: Id<'events'>;
  productTitle: string;
  productDescription: string;
  /** What the buyer paid. */
  price: number;
  /** From the label price to the paid price (and, on the seller copy, to the payout). */
  priceLines: PriceLine[];
  copy: InvoiceCopy;
  productImageDataUrl?: string;
  fileName?: string;
};

const tr = (key: string, values?: Record<string, unknown>) =>
  i18n.t(`invoice.${key}` as never, { ns: 'sales', ...values }) as string;

function sanitizeFileName(input: string): string {
  return input.replace(/[\\/:*?"<>|]+/g, '-').trim();
}

function drawLabeledLine(doc: jsPDF, label: string, x: number, lineY: number, width: number) {
  const fontSize = 8.5;

  doc.setFontSize(fontSize);
  doc.setTextColor(...PDF_TEXT_COLOR_LIGHT);
  doc.setFont(PDF_FONT_FAMILY, 'normal');

  doc.setDrawColor(...PDF_LINE_COLOR);
  doc.setLineWidth(0.2);
  doc.line(x, lineY, x + width, lineY);

  const labelY = lineY + 3.8;
  doc.text(label, x, labelY);
}

function drawPlaceholderSection(
  doc: jsPDF,
  options: {
    x: number;
    startY: number;
    sectionWidth: number;
    labels: string[];
    title?: string;
    titleFontSize?: number;
    lineGap?: number;
    headerToFirstLineGap?: number;
    align?: 'left' | 'right';
  }
): number {
  const {
    x,
    startY,
    sectionWidth,
    labels,
    title,
    titleFontSize = 11.5,
    lineGap = 14,
    headerToFirstLineGap = 12,
    align = 'left',
  } = options;

  let currentY = startY;

  if (title) {
    doc.setFont(PDF_FONT_FAMILY, 'bold');
    doc.setFontSize(titleFontSize);
    doc.setTextColor(...PDF_TEXT_COLOR_DARK);
    const labelW = 14;
    const lineW = sectionWidth - labelW;
    const lineStartX = align === 'right' ? x + sectionWidth - lineW : x;
    doc.text(title, lineStartX, currentY);
    currentY += headerToFirstLineGap;
  }

  const labelW = 14;
  const lineW = sectionWidth - labelW;
  const lineStartX = align === 'right' ? x + sectionWidth - lineW : x;
  for (const label of labels) {
    drawLabeledLine(doc, label, lineStartX, currentY, lineW);
    currentY += lineGap;
  }

  return currentY;
}

function wrapText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  fontSize: number = 9.0,
  fontStyle: 'normal' | 'bold' = 'normal',
  textColor: [number, number, number] = PDF_TEXT_COLOR_LIGHT
): number {
  const safeText = text ?? '';
  const words = safeText.split(/\s+/);
  let line = '';
  let currentY = y;

  doc.setFontSize(fontSize);
  doc.setTextColor(...textColor);
  doc.setFont(PDF_FONT_FAMILY, fontStyle);
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    const width = doc.getTextWidth(candidate);
    if (width <= maxWidth) {
      line = candidate;
      continue;
    }

    if (line) {
      doc.text(line, x, currentY);
      currentY += lineHeight;
    }
    line = word;
  }

  if (line) {
    doc.text(line, x, currentY);
    currentY += lineHeight;
  }

  return currentY;
}

export async function downloadPrivateInvoicePdf(input: PrivateInvoicePdfInput): Promise<void> {
  const {
    eventId,
    productTitle,
    productDescription,
    price,
    priceLines,
    copy,
    productImageDataUrl,
    fileName,
  } = input;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const PAGE_W = 210;
  const M = 14;

  // Header
  doc.setFont(PDF_FONT_FAMILY, 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...PDF_TEXT_COLOR_DARK);
  doc.text(tr('title'), M, M);
  doc.setFont(PDF_FONT_FAMILY, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_TEXT_COLOR_LIGHT);
  doc.text(tr('date', { date: new Date().toLocaleDateString(dateLocale()) }), M, M + 6);
  doc.text(copy === 'seller' ? tr('sellerCopy') : tr('buyerCopy'), PAGE_W - M, M + 6, {
    align: 'right',
  });

  // Body layout
  let cursorY = M + 36;

  const sectionWidth = (PAGE_W - 2 * M - 6) / 2;
  const leftX = M;
  const rightX = M + sectionWidth + 6;

  drawPlaceholderSection(doc, {
    x: leftX,
    startY: cursorY,
    sectionWidth,
    title: tr('seller'),
    labels: [tr('name'), tr('street'), tr('city')],
    align: 'left',
  });
  drawPlaceholderSection(doc, {
    x: rightX,
    startY: cursorY,
    sectionWidth,
    title: tr('buyer'),
    labels: [tr('name'), tr('street'), tr('city')],
    align: 'right',
  });

  cursorY += 76;

  doc.setFont(PDF_FONT_FAMILY, 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(...PDF_TEXT_COLOR_DARK);
  doc.text(tr('item'), leftX, cursorY);
  cursorY += 6;

  const tableX = M;
  const tableW = PAGE_W - 2 * M;
  const col1W = 45;
  const col3W = 35;
  const col2W = tableW - col1W - col3W;

  const tableY = cursorY + 1;
  const tableVerticalPadding = 3;
  const contentTopY = tableY + tableVerticalPadding;

  const imgX = tableX;
  const imgW = col1W;

  const textX = tableX + col1W + 4;
  const priceX = tableX + col1W + col2W;

  const titleY = contentTopY + 4;
  const afterTitleY = wrapText(
    doc,
    productTitle,
    textX,
    titleY,
    col2W - 6,
    3.6,
    9.2,
    'bold',
    PDF_TEXT_COLOR_DARK
  );

  const descStartY = afterTitleY + 2;
  const afterDescY = wrapText(
    doc,
    productDescription,
    textX,
    descStartY,
    col2W - 6,
    3.3,
    8.7,
    'normal',
    PDF_TEXT_COLOR_LIGHT
  );

  const contentBottomY = afterDescY + 2;
  const minRowH = 22;
  const rowH = Math.max(contentBottomY - contentTopY, minRowH);
  const tableBottomY = contentTopY + rowH + tableVerticalPadding;

  doc.setDrawColor(...PDF_LINE_COLOR);
  doc.setLineWidth(0.2);
  doc.line(tableX, tableY, tableX + tableW, tableY);
  doc.line(tableX, tableBottomY, tableX + tableW, tableBottomY);

  if (productImageDataUrl) {
    try {
      const format = productImageDataUrl.startsWith('data:image/png')
        ? 'PNG'
        : productImageDataUrl.startsWith('data:image/jpeg') ||
            productImageDataUrl.startsWith('data:image/jpg')
          ? 'JPEG'
          : 'PNG';

      // Preserve aspect ratio and fit the image into the available box.
      const imgBoxH = rowH;
      const boxW = imgW - 2;
      const boxH = imgBoxH - 2;
      const props = doc.getImageProperties(productImageDataUrl);
      const scale = Math.min(boxW / props.width, boxH / props.height);
      const drawW = props.width * scale;
      const drawH = props.height * scale;
      const drawX = imgX + 1;
      const drawY = contentTopY + 1 + (boxH - drawH) / 2;

      doc.addImage(productImageDataUrl, format, drawX, drawY, drawW, drawH);
    } catch {
      // Keep PDF generation robust even if image parsing fails.
    }
  }

  const priceTitleY = contentTopY + 4;
  doc.setFont(PDF_FONT_FAMILY, 'bold');
  doc.setFontSize(9.2);
  doc.setTextColor(...PDF_TEXT_COLOR_DARK);
  doc.text(tr('price'), priceX + 3, priceTitleY);

  doc.setFont(PDF_FONT_FAMILY, 'bold');
  doc.setFontSize(11);
  doc.text(`${formatPriceDE(price)} €`, priceX + 3, priceTitleY + 6);

  // How the price came about, one line per step
  cursorY = tableBottomY + 9;
  doc.setFont(PDF_FONT_FAMILY, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_TEXT_COLOR_DARK);
  doc.text(tr('calculation'), M, cursorY);
  cursorY += 6;
  const amountX = PAGE_W - M;
  for (const line of priceLines) {
    const isTotal = line.kind === 'total';
    if (isTotal) {
      doc.setDrawColor(...PDF_LINE_COLOR);
      doc.line(M + 90, cursorY - 3.6, amountX, cursorY - 3.6);
    }
    doc.setFont(PDF_FONT_FAMILY, isTotal ? 'bold' : 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...(isTotal ? PDF_TEXT_COLOR_DARK : PDF_TEXT_COLOR_LIGHT));
    doc.text(line.label, M + 90, cursorY);
    // ASCII minus: the built-in PDF font has no U+2212
    const sign = line.amount < 0 ? '- ' : '';
    doc.text(`${sign}${formatPriceDE(Math.abs(line.amount))} €`, amountX, cursorY, {
      align: 'right',
    });
    cursorY += isTotal ? 7 : 5;
  }

  doc.setFont(PDF_FONT_FAMILY, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_TEXT_COLOR_LIGHT);
  const notes = [tr('private'), ...(copy === 'seller' ? [tr('feeNote')] : [])];
  for (const note of notes) {
    for (const part of doc.splitTextToSize(note, PAGE_W - 2 * M) as string[]) {
      doc.text(part, M, cursorY);
      cursorY += 3.6;
    }
  }

  cursorY += 22;

  drawPlaceholderSection(doc, {
    x: leftX,
    startY: cursorY + 2.5,
    sectionWidth,
    labels: [tr('signSeller')],
    lineGap: 10,
    headerToFirstLineGap: 0,
    align: 'left',
  });
  drawPlaceholderSection(doc, {
    x: rightX,
    startY: cursorY + 2.5,
    sectionWidth,
    labels: [tr('signBuyer')],
    lineGap: 10,
    headerToFirstLineGap: 0,
    align: 'right',
  });

  const safeFileName = sanitizeFileName(
    fileName ?? `${tr('fileName')}-${productTitle}-${eventId ? eventId.toString() : 'download'}`
  );
  doc.save(`${safeFileName}.pdf`);
}
