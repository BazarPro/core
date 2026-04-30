import { jsPDF } from 'jspdf';
import type { Id } from '../../convex/_generated/dataModel';
import { formatPriceDE } from './utils';

const PDF_FONT_FAMILY = 'helvetica';
const PDF_TEXT_COLOR_LIGHT: [number, number, number] = [124, 124, 124];
const PDF_TEXT_COLOR_DARK: [number, number, number] = [50, 50, 50];
const PDF_LINE_COLOR: [number, number, number] = [124, 124, 124];

type PrivateInvoicePdfInput = {
  eventId?: Id<'events'>;
  productTitle: string;
  productDescription: string;
  price: number;
  discountPercent?: number;
  productImageDataUrl?: string;
  fileName?: string;
};

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
    discountPercent,
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
  doc.text('Privatrechnung', M, M);
  doc.setFont(PDF_FONT_FAMILY, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_TEXT_COLOR_LIGHT);
  doc.text(`Datum: ${new Date().toLocaleDateString('de-DE')}`, M, M + 6);

  // Body layout
  let cursorY = M + 36;

  const sectionWidth = (PAGE_W - 2 * M - 6) / 2;
  const leftX = M;
  const rightX = M + sectionWidth + 6;

  drawPlaceholderSection(doc, {
    x: leftX,
    startY: cursorY,
    sectionWidth,
    title: 'Verkäufer',
    labels: ['Name', 'Straße, Hausnummer', 'PLZ, Ort'],
    align: 'left',
  });
  drawPlaceholderSection(doc, {
    x: rightX,
    startY: cursorY,
    sectionWidth,
    title: 'Käufer',
    labels: ['Name', 'Straße, Hausnummer', 'PLZ, Ort'],
    align: 'right',
  });

  cursorY += 76;

  doc.setFont(PDF_FONT_FAMILY, 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(...PDF_TEXT_COLOR_DARK);
  doc.text('Verkaufter Artikel', leftX, cursorY);
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
  doc.text('Preis', priceX + 3, priceTitleY);

  let currentPriceY = priceTitleY + 6;
  if (discountPercent && discountPercent > 0) {
    doc.setFont(PDF_FONT_FAMILY, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_TEXT_COLOR_LIGHT);
    doc.text(`Original: ${formatPriceDE(price)} €`, priceX + 3, currentPriceY);
    currentPriceY += 4;
    doc.text(`Rabatt: -${discountPercent}%`, priceX + 3, currentPriceY);
    currentPriceY += 5;

    const discountedPrice = price * (1 - discountPercent / 100);
    doc.setFont(PDF_FONT_FAMILY, 'bold');
    doc.setFontSize(9.2);
    doc.setTextColor(220, 38, 38); // destructive/red
    doc.text(`${formatPriceDE(discountedPrice)} €`, priceX + 3, currentPriceY);
  } else {
    doc.setFont(PDF_FONT_FAMILY, 'normal');
    doc.setFontSize(8.7);
    doc.setTextColor(...PDF_TEXT_COLOR_LIGHT);
    doc.text(`${formatPriceDE(price)} €`, priceX + 3, currentPriceY);
  }

  cursorY = tableBottomY + 36;

  drawPlaceholderSection(doc, {
    x: leftX,
    startY: cursorY + 2.5,
    sectionWidth,
    labels: ['Unterschrift Verkäufer'],
    lineGap: 10,
    headerToFirstLineGap: 0,
    align: 'left',
  });
  drawPlaceholderSection(doc, {
    x: rightX,
    startY: cursorY + 2.5,
    sectionWidth,
    labels: ['Unterschrift Käufer'],
    lineGap: 10,
    headerToFirstLineGap: 0,
    align: 'right',
  });

  const safeFileName = sanitizeFileName(
    fileName ?? `Privatrechnung-${productTitle}-${eventId ? eventId.toString() : 'download'}`
  );
  doc.save(`${safeFileName}.pdf`);
}
