import type { jsPDF } from 'jspdf';
import { unzlibSync } from 'fflate';
import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff?url';
import inter700 from '@fontsource/inter/files/inter-latin-700-normal.woff?url';
import inter800 from '@fontsource/inter/files/inter-latin-800-normal.woff?url';
import fredoka500 from '@fontsource/fredoka/files/fredoka-latin-500-normal.woff?url';
import fredoka600 from '@fontsource/fredoka/files/fredoka-latin-600-normal.woff?url';
import fredoka700 from '@fontsource/fredoka/files/fredoka-latin-700-normal.woff?url';
import { PDF_FAMILY, type FontFamily } from './painter';

/**
 * The fonts of the promo designs for jsPDF, which needs TrueType: the WOFF files the app
 * ships for the browser are TrueType tables, each compressed on its own, so unpacking them
 * gives the TTF back. Loaded only when a PDF is made.
 */

const FILES: [FontFamily, number, string][] = [
  ['sans', 400, inter400],
  ['sans', 700, inter700],
  ['sans', 800, inter800],
  ['round', 500, fredoka500],
  ['round', 600, fredoka600],
  ['round', 700, fredoka700],
];

let loaded: Promise<{ name: string; family: string; style: string; data: string }[]> | null = null;

/** WOFF 1.0 → TTF/OTF (https://www.w3.org/TR/WOFF/) */
export function woffToSfnt(woff: Uint8Array): Uint8Array {
  const view = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
  if (view.getUint32(0) !== 0x774f4646) throw new Error('Not a WOFF file');
  const flavor = view.getUint32(4);
  const numTables = view.getUint16(12);
  const tables: { tag: number; checksum: number; data: Uint8Array }[] = [];
  for (let i = 0; i < numTables; i++) {
    const entry = 44 + i * 20;
    const tag = view.getUint32(entry);
    const offset = view.getUint32(entry + 4);
    const compLength = view.getUint32(entry + 8);
    const origLength = view.getUint32(entry + 12);
    const checksum = view.getUint32(entry + 16);
    const raw = woff.subarray(offset, offset + compLength);
    const data = compLength < origLength ? unzlibSync(raw) : raw;
    tables.push({ tag, checksum, data });
  }
  const headerSize = 12 + 16 * numTables;
  const total = tables.reduce((sum, t) => sum + ((t.data.length + 3) & ~3), headerSize);
  const out = new Uint8Array(total);
  const outView = new DataView(out.buffer);
  const power = 2 ** Math.floor(Math.log2(numTables));
  outView.setUint32(0, flavor);
  outView.setUint16(4, numTables);
  outView.setUint16(6, power * 16);
  outView.setUint16(8, Math.log2(power));
  outView.setUint16(10, numTables * 16 - power * 16);
  let offset = headerSize;
  tables.forEach((table, i) => {
    const entry = 12 + i * 16;
    outView.setUint32(entry, table.tag);
    outView.setUint32(entry + 4, table.checksum);
    outView.setUint32(entry + 8, offset);
    outView.setUint32(entry + 12, table.data.length);
    out.set(table.data, offset);
    offset += (table.data.length + 3) & ~3;
  });
  return out;
}

function toBinaryString(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    result += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return result;
}

/** Adds Inter and Fredoka to the document, by their family name and weight ("700"). */
export async function registerPromoFonts(doc: jsPDF): Promise<void> {
  loaded ??= Promise.all(
    FILES.map(async ([family, weight, url]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Font ${url}: ${response.status}`);
      const ttf = woffToSfnt(new Uint8Array(await response.arrayBuffer()));
      return {
        name: `${PDF_FAMILY[family]}-${weight}.ttf`,
        family: PDF_FAMILY[family],
        style: String(weight),
        data: btoa(toBinaryString(ttf)),
      };
    })
  ).catch((error: unknown) => {
    loaded = null;
    throw error;
  });
  for (const font of await loaded) {
    doc.addFileToVFS(font.name, font.data);
    doc.addFont(font.name, font.family, font.style);
  }
}
