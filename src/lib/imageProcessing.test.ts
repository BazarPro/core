import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { normalizeImageForUpload } from './imageProcessing';

/** An image of the given size; with `broken` it fails to load. */
function fakeImage(width: number, height: number, broken = false) {
  return class {
    width = width;
    height = height;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_: string) {
      setTimeout(() => (broken ? this.onerror?.() : this.onload?.()), 0);
    }
  };
}

let drawn: { width: number; height: number } | null;
let toBlobResult: Blob | null;

beforeEach(() => {
  drawn = null;
  toBlobResult = new Blob(['x'], { type: 'image/webp' });
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:1'),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement
  ) {
    const { width, height } = this;
    return {
      drawImage: () => {
        drawn = { width, height };
      },
    } as never;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
    callback(toBlobResult)
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const photo = new File(['raw'], 'Kinderwagen.jpeg', { type: 'image/jpeg' });

describe('normalizeImageForUpload', () => {
  test('scales large photos into the box and stores them as WebP', async () => {
    vi.stubGlobal('Image', fakeImage(4000, 3000));
    const file = await normalizeImageForUpload(photo);
    expect(drawn).toEqual({ width: 1600, height: 1200 });
    expect(file.name).toBe('Kinderwagen.webp');
    expect(file.type).toBe('image/webp');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1');
  });

  test('keeps small photos at their size, with other formats on request', async () => {
    vi.stubGlobal('Image', fakeImage(300, 200));
    expect((await normalizeImageForUpload(photo, { mimeType: 'image/jpeg' })).name).toBe(
      'Kinderwagen.jpg'
    );
    expect(drawn).toEqual({ width: 300, height: 200 });
    expect((await normalizeImageForUpload(photo, { mimeType: 'image/png' })).name).toBe(
      'Kinderwagen.png'
    );
    expect((await normalizeImageForUpload(photo, { mimeType: 'image/avif' })).name).toBe(
      'Kinderwagen.img'
    );
  });

  test('reports images that cannot be loaded or processed', async () => {
    vi.stubGlobal('Image', fakeImage(10, 10, true));
    await expect(normalizeImageForUpload(photo)).rejects.toThrow('Could not load the image.');

    vi.stubGlobal('Image', fakeImage(10, 10));
    toBlobResult = null;
    await expect(normalizeImageForUpload(photo)).rejects.toThrow('Could not process the image.');

    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    await expect(normalizeImageForUpload(photo)).rejects.toThrow('canvas context');
  });
});
