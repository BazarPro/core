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

/** A frame around the pile on the left, the two basket marks and, if any, the letter. */
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
  const { pile } = layout;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(layout.frame);
  doc.roundedRect(x, y, width, height, layout.radius, layout.radius, 'S');

  doc.setFillColor(...fill);
  doc.roundedRect(x + pile.x, y + pile.y, pile.width, pile.height, pile.radius, pile.radius, 'F');
  doc.setFillColor(...ink);
  drawShape(doc, mark.pile, x + pile.shape.x, y + pile.shape.y, pile.shape.size, 'F');
  doc.setTextColor(...ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(points(pile.digit.em));
  doc.text(String(mark.pile), x + pile.digit.x, y + pile.digit.y, { align: 'center' });
  for (const { char, x: letterX, y: letterY, em } of layout.letters) {
    doc.setFontSize(points(em));
    doc.text(char, x + letterX, y + letterY, { align: 'center' });
  }

  doc.setTextColor(0, 0, 0);
  for (const [i, basket] of layout.baskets.entries()) {
    const value = mark.baskets[i];
    doc.setFillColor(...SORT_COLORS[Math.floor(value / 10)].fill);
    doc.setLineWidth(basket.size * 0.03);
    drawShape(doc, value % 10, x + basket.shapeX, y + basket.y, basket.size, 'FD');
    doc.setFontSize(points(basket.number.em));
    doc.text(basketNumber(value), x + basket.number.x, y + basket.number.y, { align: 'center' });
  }
}
