import { jsPDF } from 'jspdf';
import { compareSortCodes } from '../shared/sortCode';
import { savePdf } from './saveFile';
import { drawSortMark } from './sortMarkPdf';

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 15;

export interface SortSheetSeller {
  sortCode: number;
  name: string;
  sellerNumber?: number;
}

/** A4 pages with two sheets each, in sorting order: one for each seller's basket. */
export function buildSortSheetsPdf(sellers: SortSheetSeller[]): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const sheetHeight = PAGE_HEIGHT / 2;
  const sorted = [...sellers].sort((a, b) => compareSortCodes(a.sortCode, b.sortCode));
  for (const [i, seller] of sorted.entries()) {
    if (i > 0 && i % 2 === 0) doc.addPage();
    const y = (i % 2) * sheetHeight;
    drawSortMark(doc, seller.sortCode, MARGIN, y + MARGIN, PAGE_WIDTH - 2 * MARGIN, 90);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.text(seller.name, MARGIN, y + MARGIN + 104, { maxWidth: PAGE_WIDTH - 2 * MARGIN - 30 });
    if (seller.sellerNumber !== undefined) {
      doc.text(`Nr. ${seller.sellerNumber}`, PAGE_WIDTH - MARGIN, y + MARGIN + 104, {
        align: 'right',
      });
    }
    if (i % 2 === 0) {
      doc.setDrawColor(190);
      doc.setLineWidth(0.1);
      doc.line(0, sheetHeight, PAGE_WIDTH, sheetHeight);
    }
  }
  return doc;
}

export async function downloadSortSheets(sellers: SortSheetSeller[]): Promise<void> {
  await savePdf(buildSortSheetsPdf(sellers), 'BazarPro-Sortierblaetter.pdf');
}
