import { jsPDF } from 'jspdf';
import type { ApiClient } from './api/client';
import { api } from './api/functions';
import type { Id } from './api/types';
import type { LabelFormat } from '../shared/constants';
import { drawLabelQr, labelUrl } from './qrCode';
import { drawSortMark } from './sortMarkPdf';
import { savePdf } from './saveFile';
import {
  LABEL_LAYOUTS,
  MARGIN_MM,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  planLabel,
  wrapText,
  type LabelText,
  type MeasureText,
} from './labelLayout';

export { LABEL_LAYOUTS, labelInfoLine, labelPrice } from './labelLayout';

/** MAX_LABELS in backend/src/modules/labels.rs */
const LABELS_PER_REQUEST = 500;

export interface LabelData extends LabelText {
  productId: Id<'products'>;
}

/** Splits a title into up to `maxLines` lines at the font of `doc`; see wrapText. */
export function wrapTitle(
  doc: jsPDF,
  title: string,
  maxWidthMm: number,
  maxLines: number
): string[] {
  return wrapText((text) => doc.getTextWidth(text), title, maxWidthMm, maxLines);
}

interface Cell {
  x: number;
  y: number;
  width: number;
  height: number;
}

function drawCutLines(doc: jsPDF, cell: Cell): void {
  doc.setDrawColor(130);
  doc.setLineWidth(0.2);
  doc.rect(cell.x, cell.y, cell.width, cell.height);
}

/** One label as laid out in labelLayout.ts: QR code, sorting mark, texts and cut lines. */
function drawLabel(doc: jsPDF, label: LabelData, format: LabelFormat, cell: Cell): void {
  const measure: MeasureText = (text, pt, bold) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(pt);
    return doc.getTextWidth(text);
  };
  const plan = planLabel(label, format, measure);
  const { qr, mark } = plan;
  drawLabelQr(doc, labelUrl(label.productId), cell.x + qr.x, cell.y + qr.y, qr.size);
  if (label.sortCode !== undefined && mark) {
    drawSortMark(doc, label.sortCode, cell.x + mark.x, cell.y + mark.y, mark.width, mark.height);
  }
  doc.setTextColor(0, 0, 0);
  for (const text of plan.texts) {
    doc.setFont('helvetica', text.bold ? 'bold' : 'normal');
    doc.setFontSize(text.pt);
    doc.text(text.text, cell.x + text.x, cell.y + text.y, {
      align: text.align === 'left' ? undefined : text.align,
    });
  }
  drawCutLines(doc, cell);
}

/** Says below the labels where to cut. */
function drawCutHint(doc: jsPDF): void {
  doc.setTextColor(110);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Entlang der grauen Linien ausschneiden', PAGE_WIDTH / 2, PAGE_HEIGHT - 4, {
    align: 'center',
  });
}

/**
 * A4 pages with one label per item in the given format. `startAt`: the first free place on
 * a sheet that is partly used, counted from 1 row by row.
 */
export function buildLabelsPdf(
  labels: LabelData[],
  format: LabelFormat,
  startAt = 1,
  compress = true
): jsPDF {
  const { cols, rows } = LABEL_LAYOUTS[format];
  const width = (PAGE_WIDTH - 2 * MARGIN_MM) / cols;
  const height = (PAGE_HEIGHT - 2 * MARGIN_MM) / rows;
  const perPage = cols * rows;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress });
  doc.setTextColor(0, 0, 0);

  const skipped = Math.min(Math.max(Math.trunc(startAt) || 1, 1), perPage) - 1;
  for (const [i, label] of labels.entries()) {
    const place = i + skipped;
    if (i > 0 && place % perPage === 0) {
      drawCutHint(doc);
      doc.addPage();
    }
    const index = place % perPage;
    const cell = {
      x: MARGIN_MM + (index % cols) * width,
      y: MARGIN_MM + Math.floor(index / cols) * height,
      width,
      height,
    };
    drawLabel(doc, label, format, cell);
  }
  drawCutHint(doc);
  return doc;
}

/**
 * The one way to labels: loads what goes on them (sorting code, size, price and the label
 * sheet of the bazaar) and downloads the PDF. With `eventId` the labels are for that bazaar.
 */
export async function downloadLabelsPdf(
  client: ApiClient,
  productIds: Id<'products'>[],
  eventId?: Id<'events'>,
  startAt = 1
): Promise<number> {
  if (productIds.length === 0) return 0;
  const labels: LabelData[] = [];
  const formats = new Set<LabelFormat>();
  // The backend answers for a limited number of items at once
  for (let i = 0; i < productIds.length; i += LABELS_PER_REQUEST) {
    const data = await client.query(api.labels.getLabelData, {
      productIds: productIds.slice(i, i + LABELS_PER_REQUEST),
      eventId,
    });
    if (data.labels.length > 0) formats.add(data.format);
    labels.push(...data.labels);
  }
  if (labels.length === 0) return 0;
  // Items of bazaars with different sheets: the large labels
  const format = formats.size === 1 ? [...formats][0] : 'standard';
  await savePdf(buildLabelsPdf(labels, format, startAt), 'BazarPro-Etiketten.pdf');
  // "Label missing" goes away for these items; the PDF is there even if this fails
  const printed = labels.map((label) => label.productId);
  try {
    for (let i = 0; i < printed.length; i += LABELS_PER_REQUEST) {
      await client.mutation(api.labels.markPrinted, {
        productIds: printed.slice(i, i + LABELS_PER_REQUEST),
        eventId,
      });
    }
  } catch {
    // An older backend without the mark, or offline: only the hint stays
  }
  return labels.length;
}
