import type { jsPDF } from 'jspdf';
import { SORT_COLORS, sortMark, sortMarkLayout, sortNumber } from '../shared/sortCode';

/** A font size in the unit of the page (mm), in points */
const points = (mm: number) => mm / 0.353;

/** A frame around the tile with digit and letter and the two fields with pair and number. */
export function drawSortMark(
  doc: jsPDF,
  code: number,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const mark = sortMark(code);
  const { frame, radius, tile, fields } = sortMarkLayout(mark, width, height);
  const { fill, ink } = SORT_COLORS[mark.pile];
  const text = (value: string, at: { x: number; y: number; em: number }) => {
    doc.setFontSize(points(at.em));
    doc.text(value, x + at.x, y + at.y, { align: 'center' });
  };

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(frame);
  doc.roundedRect(x, y, width, height, radius, radius, 'S');
  doc.setFont('helvetica', 'bold');

  doc.setFillColor(...fill);
  doc.roundedRect(x + tile.x, y + tile.y, tile.width, tile.height, tile.radius, tile.radius, 'F');
  doc.setTextColor(...ink);
  text(String(mark.pile), tile.digit);
  text(mark.letter, tile.letter);
  if (tile.extra) {
    const { extra } = tile;
    doc.setFillColor(...ink);
    doc.roundedRect(
      x + extra.x,
      y + extra.y,
      extra.width,
      extra.height,
      extra.radius,
      extra.radius,
      'F'
    );
    doc.setTextColor(...fill);
    text(mark.extra, extra.text);
  }

  const values = [
    { value: mark.pair, color: SORT_COLORS[mark.pairColor] },
    { value: sortNumber(mark.number), color: SORT_COLORS[mark.numberColor] },
  ];
  for (const [i, field] of fields.entries()) {
    const { value, color } = values[i];
    doc.setFillColor(...color.fill);
    doc.roundedRect(
      x + field.x,
      y + field.y,
      field.width,
      field.height,
      field.radius,
      field.radius,
      'F'
    );
    doc.setTextColor(...color.ink);
    text(value, field.text);
  }
  doc.setTextColor(0, 0, 0);
}
