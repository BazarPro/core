import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { woffToSfnt } from './pdfFonts';

describe('woffToSfnt', () => {
  it('unpacks the bundled WOFF into a TrueType font with all its tables', () => {
    const woff = new Uint8Array(
      readFileSync('node_modules/@fontsource/inter/files/inter-latin-700-normal.woff')
    );
    const ttf = woffToSfnt(woff);
    const view = new DataView(ttf.buffer);
    const woffView = new DataView(woff.buffer, woff.byteOffset);
    expect(view.getUint32(0)).toBe(0x00010000);
    const tables = view.getUint16(4);
    expect(tables).toBe(woffView.getUint16(12));
    // The size the WOFF header names for the unpacked font
    expect(ttf.length).toBe(woffView.getUint32(16));
    const tags = Array.from({ length: tables }, (_, i) =>
      String.fromCharCode(...ttf.subarray(12 + i * 16, 16 + i * 16))
    );
    expect(tags).toEqual(expect.arrayContaining(['cmap', 'glyf', 'head', 'hmtx', 'name']));
  });

  it('refuses other files', () => {
    expect(() => woffToSfnt(new Uint8Array(64))).toThrow('Not a WOFF file');
  });
});
