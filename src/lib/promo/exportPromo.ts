import { jsPDF } from 'jspdf';
import { saveFile } from '../saveFile';
import { fileSlug } from '../pdfTable';
import { PdfPainter } from './painter';
import { registerPromoFonts } from './pdfFonts';
import {
  hasBack,
  layoutPromo,
  PROMO_FORMATS,
  promoAspect,
  renderPromo,
  type PromoSide,
  type PromoSpec,
} from './renderPromo';

/**
 * Files of the promo page: PNG for social media, PDF for the printer. A poster is one page
 * in A4 or A3; flyers come two A5 to an A4 sheet with a line to cut along, with the back on
 * a second page for double-sided printing.
 *
 * In the PDF all text, cards, numbers and the QR code are vectors with embedded fonts;
 * only photos and color gradients are an image underneath.
 */

export type PosterPaper = 'a4' | 'a3';

/** Resolution of the photo layer: plenty for photos, and the PDF stays small */
const PHOTO_DPI = 150;

function imageCanvas(spec: PromoSpec): HTMLCanvasElement {
  const format = PROMO_FORMATS[spec.format];
  const width = format.kind === 'image' ? format.width : 1600;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round(width / promoAspect(spec.format));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas');
  renderPromo(ctx, spec, width);
  return canvas;
}

/** The PNG of an image format (or of the front of a print format) */
export async function promoImageBlob(spec: PromoSpec): Promise<Blob> {
  const canvas = imageCanvas(spec);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG failed'))), 'image/png')
  );
}

export function promoFileName(spec: PromoSpec, title: string, paper: PosterPaper = 'a4'): string {
  switch (spec.format) {
    case 'poster':
      return `${fileSlug(`Plakat-${paper.toUpperCase()}`, title)}.pdf`;
    case 'flyer':
      return `${fileSlug('Flyer-A5', title)}.pdf`;
    case 'post':
      return `${fileSlug('Beitrag', title)}.png`;
    case 'story':
      return `${fileSlug('Story', title)}.png`;
    case 'banner':
      return `${fileSlug('Banner', title)}.png`;
  }
}

/**
 * One page of the design at (x, y), `widthMm` wide: the photo layer as JPEG, then the
 * text and shapes on top.
 */
function drawOnPdf(
  doc: jsPDF,
  spec: PromoSpec,
  x: number,
  y: number,
  widthMm: number,
  alias: string
) {
  const heightMm = widthMm / promoAspect(spec.format);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round((widthMm / 25.4) * PHOTO_DPI);
  canvas.height = Math.round((heightMm / 25.4) * PHOTO_DPI);
  const bg = canvas.getContext('2d');
  if (!bg) throw new Error('No 2D canvas');
  bg.scale(canvas.width / 1000, canvas.width / 1000);
  const fg = new PdfPainter(doc, { x, y }, widthMm);
  layoutPromo(spec, fg, bg);
  doc.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', x, y, widthMm, heightMm, alias);
  fg.flush();
}

export async function promoPdfBlob(spec: PromoSpec, paper: PosterPaper = 'a4'): Promise<Blob> {
  if (spec.format === 'flyer') {
    // Two A5 flyers side by side on A4 landscape; the back on page 2
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    await registerPromoFonts(doc);
    const sides: PromoSide[] = hasBack(spec) ? ['front', 'back'] : ['front'];
    sides.forEach((side, index) => {
      if (index > 0) doc.addPage('a4', 'landscape');
      const sideSpec = { ...spec, side };
      // The same picture twice: one image in the file
      drawOnPdf(doc, sideSpec, 0, 0, 148.5, `flyer-${side}-l`);
      drawOnPdf(doc, sideSpec, 148.5, 0, 148.5, `flyer-${side}-r`);
      doc.setDrawColor(150);
      doc.setLineDashPattern([2, 2], 0);
      doc.setLineWidth(0.2);
      doc.line(148.5, 0, 148.5, 210);
      doc.setLineDashPattern([], 0);
    });
    return doc.output('blob');
  }
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: paper });
  await registerPromoFonts(doc);
  drawOnPdf(doc, spec, 0, 0, paper === 'a3' ? 297 : 210, 'poster');
  return doc.output('blob');
}

/** The file of the current format: PDF for print, PNG for screens */
export async function promoFile(spec: PromoSpec, title: string, paper: PosterPaper): Promise<File> {
  const print = PROMO_FORMATS[spec.format].kind === 'print';
  const blob = print ? await promoPdfBlob(spec, paper) : await promoImageBlob(spec);
  return new File([blob], promoFileName(spec, title, paper), {
    type: print ? 'application/pdf' : 'image/png',
  });
}

export async function downloadPromo(spec: PromoSpec, title: string, paper: PosterPaper) {
  const file = await promoFile(spec, title, paper);
  await saveFile(file, file.name);
}
