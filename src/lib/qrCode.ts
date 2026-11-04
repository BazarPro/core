import type { jsPDF } from 'jspdf';
import * as QRCode from 'qrcode';
import { getSiteUrl } from './seo';

/**
 * All QR codes: on screen through components/ui/QrCode, in PDFs through drawLabelQr. Phones
 * read a code by the size of its modules (the black squares), so labels use a short link and
 * pick the error correction by the printed size: as much as fits while the modules stay large
 * enough.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Error correction from most (30 % of the code may be damaged) to least (7 %) */
const LEVELS = ['H', 'Q', 'M', 'L'] as const;
export type QrLevel = (typeof LEVELS)[number];

/** Smallest module that phone cameras read reliably from a printed label */
export const MIN_MODULE_MM = 0.7;
/** Light border in modules; the padding of the label cell adds to it */
export const QUIET_ZONE = 2;

/**
 * Link to the item on a label: `HTTPS://BAZARPRO.DE/P/<UUID>`. In upper case the
 * whole link fits the QR alphanumeric mode, which needs about a third less space
 * than lower case; /p/ forwards to the product page (server/public-routes.ts, App.tsx).
 */
export function labelUrl(productId: string): string {
  const site = getSiteUrl();
  return UUID.test(productId) ? `${site}/P/${productId}`.toUpperCase() : `${site}/p/${productId}`;
}

/** The strongest error correction whose modules stay at least MIN_MODULE_MM at this size. */
export function labelQr(text: string, sizeMm: number): { code: QRCode.QRCode; level: QrLevel } {
  let fallback: { code: QRCode.QRCode; level: QrLevel } | undefined;
  for (const level of LEVELS) {
    const code = QRCode.create(text, { errorCorrectionLevel: level });
    fallback = { code, level };
    if (moduleSize(code, sizeMm) >= MIN_MODULE_MM) return fallback;
  }
  // Too small for any level: the least error correction gives the largest modules
  return fallback!;
}

export function moduleSize(code: QRCode.QRCode, sizeMm: number): number {
  return sizeMm / (code.modules.size + 2 * QUIET_ZONE);
}

/** Screens are sharp and bright, so one level fits every code in the app. */
export function screenQr(text: string): QRCode.QRCode {
  return QRCode.create(text, { errorCorrectionLevel: 'M' });
}

/** The dark runs of each row in modules, with the light border; `total` is the full width. */
export function qrRuns(code: QRCode.QRCode): {
  total: number;
  runs: { x: number; y: number; width: number }[];
} {
  const { size } = code.modules;
  const runs: { x: number; y: number; width: number }[] = [];
  for (let row = 0; row < size; row++) {
    let start = -1;
    for (let col = 0; col <= size; col++) {
      const dark = col < size && code.modules.get(row, col);
      if (dark && start < 0) start = col;
      if (!dark && start >= 0) {
        runs.push({ x: QUIET_ZONE + start, y: QUIET_ZONE + row, width: col - start });
        start = -1;
      }
    }
  }
  return { total: size + 2 * QUIET_ZONE, runs };
}

/** Draws the code as vector squares, so it prints sharp at any resolution. */
export function drawLabelQr(doc: jsPDF, text: string, x: number, y: number, sizeMm: number) {
  const { code } = labelQr(text, sizeMm);
  const module = moduleSize(code, sizeMm);
  doc.setFillColor(0, 0, 0);
  for (const run of qrRuns(code).runs) {
    // A hair taller than the module, so PDF viewers show no seams between rows
    doc.rect(x + run.x * module, y + run.y * module, run.width * module, module + 0.02, 'F');
  }
}
