import type { jsPDF } from 'jspdf';

/** Tables of plain text cells for the PDF and CSV downloads of organizers. */

const LINE = 4;

/**
 * Draws a table from `y` on: cells wrap to the column widths (mm), a new page repeats the
 * header. Returns where the table ends.
 */
export function drawTable(
  doc: jsPDF,
  {
    columns,
    headers,
    rows,
    y,
    margin,
  }: {
    columns: number[];
    headers: string[];
    rows: string[][];
    y: number;
    margin: number;
  }
): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  const width = columns.reduce((a, b) => a + b, 0);
  const drawRow = (cells: string[], bold: boolean) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    const wrapped = cells.map((cell, i) => doc.splitTextToSize(cell, columns[i] - 2) as string[]);
    const height = Math.max(...wrapped.map((lines) => lines.length)) * LINE + 2;
    if (y + height > pageHeight - margin) {
      doc.addPage();
      y = margin;
      if (!bold) drawRow(headers, true);
    }
    let x = margin;
    wrapped.forEach((lines, i) => {
      doc.text(lines, x + 1, y + LINE);
      x += columns[i];
    });
    y += height;
    doc.setDrawColor(200);
    doc.line(margin, y, margin + width, y);
  };
  drawRow(headers, true);
  for (const row of rows) drawRow(row, false);
  return y;
}

/** CSV with semicolons and a byte order mark, so spreadsheet programs open it directly. */
export function toCsv(rows: string[][]): string {
  const escape = (cell: string) => (/[";\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
  const lines = rows.map((row) => row.map(escape).join(';'));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** "Abrechnung-Basar-in-Ulm" from a prefix and the title of the bazaar. */
export function fileSlug(prefix: string, title: string): string {
  const slug = title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  return `${prefix}-${slug || 'Basar'}`;
}
