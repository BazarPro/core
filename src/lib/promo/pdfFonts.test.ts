import { readFileSync } from 'node:fs';
import type { jsPDF } from 'jspdf';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerPromoFonts, woffToSfnt } from './pdfFonts';

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

describe('registerPromoFonts', () => {
  afterEach(() => vi.unstubAllGlobals());

  const woff = readFileSync('node_modules/@fontsource/inter/files/inter-latin-400-normal.woff');
  const fakeDoc = () => ({ addFileToVFS: vi.fn(), addFont: vi.fn() });

  it('fails when a font cannot be loaded, and tries again next time', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 }))
    );
    await expect(registerPromoFonts(fakeDoc() as unknown as jsPDF)).rejects.toThrow('404');

    const fetch = vi.fn(async () => new Response(woff));
    vi.stubGlobal('fetch', fetch);
    const doc = fakeDoc();
    await registerPromoFonts(doc as unknown as jsPDF);
    expect(fetch).toHaveBeenCalledTimes(6);
    expect(doc.addFont).toHaveBeenCalledWith('Inter-800.ttf', 'Inter', '800');
    expect(doc.addFont).toHaveBeenCalledWith('Fredoka-500.ttf', 'Fredoka', '500');
    // Base64 of a TrueType font
    expect(doc.addFileToVFS.mock.calls[0]![1]).toMatch(/^AAEAAA/);

    // Loaded once for all documents
    await registerPromoFonts(fakeDoc() as unknown as jsPDF);
    expect(fetch).toHaveBeenCalledTimes(6);
  });
});
