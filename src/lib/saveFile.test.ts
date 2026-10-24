import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { jsPDF } from 'jspdf';

const native = vi.hoisted(() => ({
  isNative: false,
  writeFile: vi.fn(async () => ({ uri: 'file:///cache/Etiketten.pdf' })),
  share: vi.fn(async () => ({})),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => native.isNative },
}));
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Filesystem: { writeFile: native.writeFile },
}));
vi.mock('@capacitor/share', () => ({ Share: { share: native.share } }));

import { saveFile, savePdf } from './saveFile';

const pdf = (blob: Blob) => ({ save: vi.fn(), output: vi.fn(() => blob) }) as unknown as jsPDF;

beforeEach(() => {
  native.isNative = false;
  native.writeFile.mockClear();
  native.share.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('on the web', () => {
  test('a file is downloaded under its name', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:1', revokeObjectURL: vi.fn() });
    await saveFile(new Blob(['x']), 'Termin.ics');
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('Termin.ics');
    expect(native.share).not.toHaveBeenCalled();
  });

  test('a PDF is saved by jsPDF', async () => {
    const doc = pdf(new Blob());
    await savePdf(doc, 'Rechnung.pdf');
    expect(doc.save).toHaveBeenCalledWith('Rechnung.pdf');
  });
});

describe('in the mobile app', () => {
  beforeEach(() => {
    native.isNative = true;
  });

  test('a PDF goes to the cache and the share sheet instead of a download', async () => {
    const doc = pdf(new Blob(['%PDF'], { type: 'application/pdf' }));
    await savePdf(doc, 'Etiketten.pdf');
    expect(doc.save).not.toHaveBeenCalled();
    expect(native.writeFile).toHaveBeenCalledWith({
      path: 'Etiketten.pdf',
      data: btoa('%PDF'),
      directory: 'CACHE',
    });
    expect(native.share).toHaveBeenCalledWith({ files: ['file:///cache/Etiketten.pdf'] });
  });

  test('other files are shared the same way', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    await saveFile(new Blob(['a;b']), 'Nachweis.csv');
    expect(click).not.toHaveBeenCalled();
    expect(native.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'Nachweis.csv', data: btoa('a;b') })
    );
    expect(native.share).toHaveBeenCalledOnce();
  });
});
