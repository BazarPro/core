import type { jsPDF } from 'jspdf';
import {
  SORT_COLORS,
  SORT_SHAPES,
  basketNumber,
  sortMark,
  sortMarkLayout,
} from '../shared/sortCode';

/** A font size in the unit of the page (mm), in points */
const points = (mm: number) => mm / 0.353;

function drawShape(
  doc: jsPDF,
  digit: number,
  x: number,
  y: number,
  size: number,
  style: 'F' | 'FD'
) {
  const { points: outline } = SORT_SHAPES[digit];
  const scale = size / 100;
  const deltas = outline
    .slice(1)
    .map(([px, py], i) => [(px - outline[i][0]) * scale, (py - outline[i][1]) * scale]);
  doc.lines(deltas, x + outline[0][0] * scale, y + outline[0][1] * scale, [1, 1], style, true);
}

/** The pile on the left, the two basket marks and, if any, the letter next to it. */
export function drawSortMark(
  doc: jsPDF,
  code: number,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const mark = sortMark(code);
  const layout = sortMarkLayout(mark, width, height);
  const { fill, ink } = SORT_COLORS[mark.pile];

  doc.setFillColor(...fill);
  doc.rect(x, y, layout.pile.width, height, 'F');
  doc.setFillColor(...ink);
  const { shape, digitEm } = layout.pile;
  drawShape(doc, mark.pile, x + shape.x, y + shape.y, shape.size, 'F');
  doc.setTextColor(...ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(points(digitEm));
  doc.text(String(mark.pile), x + layout.pile.width / 2, y + height * 0.95, { align: 'center' });

  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  for (const [i, basket] of layout.baskets.entries()) {
    const value = mark.baskets[i];
    doc.setFillColor(...SORT_COLORS[Math.floor(value / 10)].fill);
    doc.setLineWidth(basket.size * 0.03);
    drawShape(doc, value % 10, x + basket.shapeX, y + basket.y, basket.size, 'FD');
    doc.setFontSize(points(basket.numberEm));
    // Digits are about 0.72 of the font size high
    doc.text(
      basketNumber(value),
      x + basket.numberX,
      y + basket.y + basket.size / 2 + basket.numberEm * 0.36,
      { align: 'center' }
    );
  }
  if (layout.letter) {
    doc.setFontSize(points(layout.letter.em));
    doc.text(mark.letter, x + layout.letter.x, y + height / 2 + layout.letter.em * 0.36, {
      align: 'center',
    });
  }
}
