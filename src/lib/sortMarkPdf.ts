import type { jsPDF } from 'jspdf';
import { sortMark, type SortSymbol } from '../shared/sortCode';

function drawSymbol(doc: jsPDF, symbol: SortSymbol, cx: number, cy: number, size: number) {
  const r = size / 2;
  doc.setFillColor(...symbol.ink);
  switch (symbol.id) {
    case 'circle':
      doc.circle(cx, cy, r, 'F');
      break;
    case 'triangle':
      doc.triangle(cx, cy - r, cx - r, cy + r, cx + r, cy + r, 'F');
      break;
    case 'square':
      doc.rect(cx - r, cy - r, size, size, 'F');
      break;
    case 'diamond':
      doc.triangle(cx - r, cy, cx + r, cy, cx, cy - r, 'F');
      // A hair of overlap, so PDF viewers show no seam
      doc.triangle(cx - r, cy - 0.02, cx + r, cy - 0.02, cx, cy + r, 'F');
      break;
    case 'cross':
      doc.rect(cx - r, cy - r / 3, size, (2 * r) / 3, 'F');
      doc.rect(cx - r / 3, cy - r, (2 * r) / 3, size, 'F');
      break;
    case 'bars':
      doc.rect(cx - r, cy - r, size, size / 4, 'F');
      doc.rect(cx - r, cy - size / 8, size, size / 4, 'F');
      doc.rect(cx - r, cy + r - size / 4, size, size / 4, 'F');
      break;
  }
}

function drawField(doc: jsPDF, symbol: SortSymbol, x: number, y: number, w: number, h: number) {
  doc.setFillColor(...symbol.fill);
  doc.rect(x, y, w, h, 'F');
  drawSymbol(doc, symbol, x + w / 2, y + h / 2, Math.min(w, h) * 0.6);
}

/** The large digit (with the letter, if any) and one wide field over two small ones. */
export function drawSortMark(
  doc: jsPDF,
  code: number,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const mark = sortMark(code);
  const digitWidth = height * 0.72;
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  // 1 pt is 0.353 mm; digits are about 0.72 of the font size high
  doc.setFontSize(((mark.letter ? height * 0.72 : height) / 0.353) * 1.05);
  const digitY = mark.letter ? y + height * 0.68 : y + height * 0.86;
  doc.text(String(mark.digit), x + digitWidth / 2, digitY, { align: 'center' });
  if (mark.letter) {
    doc.setFontSize((height * 0.3) / 0.353);
    doc.text(mark.letter, x + digitWidth / 2, y + height * 0.98, { align: 'center' });
  }

  const fieldX = x + digitWidth;
  const fieldWidth = width - digitWidth;
  const gap = height * 0.03;
  const rowHeight = (height - gap) / 2;
  drawField(doc, mark.fields[0], fieldX, y, fieldWidth, rowHeight);
  const smallWidth = (fieldWidth - gap) / 2;
  drawField(doc, mark.fields[1], fieldX, y + rowHeight + gap, smallWidth, rowHeight);
  drawField(
    doc,
    mark.fields[2],
    fieldX + smallWidth + gap,
    y + rowHeight + gap,
    smallWidth,
    rowHeight
  );
}
