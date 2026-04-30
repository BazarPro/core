import { jsPDF } from 'jspdf';
import * as QRCode from 'qrcode';
import type { Id } from '../../convex/_generated/dataModel';
import { getProductUrl } from './utils';

/** Layout constants in mm (A4: 210 x 297 mm), 3 columns x 4 rows per page */
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN_MM = 10;
const COLS = 3;
const ROWS = 4;
const CELLS_PER_PAGE = COLS * ROWS;

const CELL_WIDTH = (PAGE_WIDTH - 2 * MARGIN_MM) / COLS;
const CELL_HEIGHT = (PAGE_HEIGHT - 2 * MARGIN_MM) / ROWS;

const QR_SIZE_MM = Math.min(CELL_WIDTH, CELL_HEIGHT - 14) - 4;
const CELL_PADDING_MM = 2;
const TITLE_GAP_MM = 3;
const TITLE_LINE_HEIGHT_MM = 4;
const TITLE_FONT_SIZE = 8;
const MAX_TITLE_LINES = 2;

export interface ProductForQR {
  productId: Id<'products'>;
  productTitle: string;
}

/**
 * Splits a title into up to two lines. On overflow, the second line is truncated with "…".
 */
function wrapTitleToLines(doc: jsPDF, title: string, maxWidthMm: number): string[] {
  const words = title.trim().split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? currentLine + ' ' + word : word;
    const width = doc.getTextWidth(candidate);

    if (width <= maxWidthMm) {
      currentLine = candidate;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        if (lines.length === MAX_TITLE_LINES) {
          lines[1] = lines[1] + '…';
          return lines;
        }
      }
      const wordWidth = doc.getTextWidth(word);
      if (wordWidth <= maxWidthMm) {
        currentLine = word;
      } else {
        let truncated = word;
        while (truncated.length > 0 && doc.getTextWidth(truncated + '…') > maxWidthMm) {
          truncated = truncated.slice(0, -1);
        }
        lines.push(truncated ? truncated + '…' : '…');
        return lines;
      }
    }
  }
  if (currentLine && lines.length < MAX_TITLE_LINES) {
    lines.push(currentLine);
  }
  return lines;
}

/**
 * Generates QR code data URL for the given product URL.
 */
async function getQRDataUrl(productUrl: string): Promise<string> {
  return QRCode.toDataURL(productUrl, {
    width: 256,
    margin: 1,
    errorCorrectionLevel: 'H',
  });
}

/**
 * Draws one QR code + title in a grid cell (for 3x4 layout).
 */

function drawCell(
  doc: jsPDF,
  qrDataUrl: string,
  productTitle: string,
  col: number,
  row: number
): void {
  const cellLeft = MARGIN_MM + col * CELL_WIDTH;
  const cellTop = MARGIN_MM + row * CELL_HEIGHT;
  const innerWidth = CELL_WIDTH - 2 * CELL_PADDING_MM;
  const qrX = cellLeft + CELL_PADDING_MM + (innerWidth - QR_SIZE_MM) / 2;
  const qrY = cellTop + CELL_PADDING_MM;

  doc.addImage(qrDataUrl, 'PNG', qrX, qrY, QR_SIZE_MM, QR_SIZE_MM);

  doc.setFontSize(TITLE_FONT_SIZE);
  doc.setTextColor(0, 0, 0);
  const titleAreaWidthMm = innerWidth;
  const titleY = qrY + QR_SIZE_MM + TITLE_GAP_MM;
  const centerX = cellLeft + CELL_WIDTH / 2;

  const lines = wrapTitleToLines(doc, productTitle, titleAreaWidthMm);
  lines.forEach((line, i) => {
    doc.text(line, centerX, titleY + i * TITLE_LINE_HEIGHT_MM, {
      align: 'center',
    });
  });
}

/**
 * Generates a PDF with 3 columns x 4 rows of QR codes per page, then triggers download.
 * @param products Array of product id and title
 */
export async function downloadProductQRCodesPdf(products: ProductForQR[]): Promise<void> {
  if (products.length === 0) return;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  for (let i = 0; i < products.length; i++) {
    if (i > 0 && i % CELLS_PER_PAGE === 0) {
      doc.addPage();
    }

    const product = products[i];
    const url = getProductUrl(product.productId);
    const qrDataUrl = await getQRDataUrl(url);

    const cellIndex = i % CELLS_PER_PAGE;
    const row = Math.floor(cellIndex / COLS);
    const col = cellIndex % COLS;

    drawCell(doc, qrDataUrl, product.productTitle, col, row);
  }

  doc.save('BazarPro-QR-Codes.pdf');
}
