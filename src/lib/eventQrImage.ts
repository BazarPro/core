import { fileSlug } from './pdfTable';
import { qrRuns, screenQr } from './qrCode';
import { saveFile } from './saveFile';

/** Width of the picture in px: sharp on a poster up to A5 */
const SIZE = 1200;

/**
 * A PNG with the QR code of a bazaar's public page and its title below, for posters,
 * flyers and handouts of the organizer.
 */
export async function eventQrBlob(url: string, title: string): Promise<Blob> {
  const { runs, total } = qrRuns(screenQr(url));
  const module = SIZE / total;
  const textHeight = 150;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE + textHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  for (const run of runs) {
    // Whole pixels, so no seams show between the modules
    const x = Math.floor(run.x * module);
    const y = Math.floor(run.y * module);
    ctx.fillRect(x, y, Math.ceil((run.x + run.width) * module) - x, Math.ceil(module) + 1);
  }
  let fontSize = 64;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  do {
    ctx.font = `bold ${fontSize}px Helvetica, Arial, sans-serif`;
  } while (ctx.measureText(title).width > SIZE - 2 * module * 2 && (fontSize -= 2) > 24);
  ctx.fillText(title, SIZE / 2, SIZE + textHeight / 2 - module, SIZE - 4 * module);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG failed'))), 'image/png')
  );
}

export async function downloadEventQr(url: string, title: string): Promise<void> {
  await saveFile(await eventQrBlob(url, title), `${fileSlug('QR-Code', title)}.png`);
}
