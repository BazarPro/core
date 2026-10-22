import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareZXingModule } from 'barcode-detector/ponyfill';
import { QRCodeScanner } from './QRCodeScanner';

const detected = vi.hoisted(() => ({ values: [] as string[] }));
vi.mock('barcode-detector/ponyfill', () => ({
  prepareZXingModule: vi.fn(),
  BarcodeDetector: class {
    async detect() {
      return detected.values.map((rawValue) => ({ rawValue }));
    }
  },
}));
vi.mock('zxing-wasm/reader/zxing_reader.wasm?url', () => ({ default: '/zxing_reader.wasm' }));

function fakeCamera(capabilities: Record<string, unknown> = {}) {
  const track = {
    stop: vi.fn(),
    applyConstraints: vi.fn(async () => {}),
    getCapabilities: () => capabilities,
  };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  return { track, stream };
}

let getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  detected.values = [];
  getUserMedia = vi.fn();
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
    get: () => 4,
    configurable: true,
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;
});

describe('QRCodeScanner', () => {
  it('reads the whole camera picture and reports every code', async () => {
    const { track, stream } = fakeCamera();
    getUserMedia.mockResolvedValue(stream);
    detected.values = ['HTTPS://BAZARPRO.DE/P/ABC'];
    const onScan = vi.fn();
    const { unmount } = render(<QRCodeScanner onScanSuccess={onScan} />);

    await waitFor(() => expect(onScan).toHaveBeenCalledWith('HTTPS://BAZARPRO.DE/P/ABC'));
    // The back camera in high resolution, for small labels
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ facingMode: 'environment', width: { ideal: 1920 } }),
      })
    );
    // No torch on this camera
    expect(screen.queryByRole('button', { name: /Taschenlampe/ })).toBeNull();
    unmount();
    expect(track.stop).toHaveBeenCalled();
  });

  it('switches the torch where the camera has one', async () => {
    const { track, stream } = fakeCamera({ torch: true });
    getUserMedia.mockResolvedValue(stream);
    render(<QRCodeScanner onScanSuccess={() => {}} />);

    const button = await screen.findByRole('button', { name: 'Taschenlampe einschalten' });
    await act(async () => fireEvent.click(button));
    expect(track.applyConstraints).toHaveBeenLastCalledWith({ advanced: [{ torch: true }] });
    expect(screen.getByRole('button', { name: 'Taschenlampe ausschalten' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('says when the camera cannot start and tries again', async () => {
    getUserMedia.mockRejectedValueOnce(new Error('NotAllowedError'));
    getUserMedia.mockResolvedValue(fakeCamera().stream);
    render(<QRCodeScanner onScanSuccess={() => {}} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Erneut versuchen' }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/konnte nicht gestartet/)).toBeNull());
  });

  it('keeps the camera off while inactive', async () => {
    render(<QRCodeScanner onScanSuccess={() => {}} active={false} />);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('loads the ZXing decoder from the app, not from a CDN', () => {
    const { overrides } = vi.mocked(prepareZXingModule).mock.calls[0][0] as {
      overrides: { locateFile: (path: string, prefix: string) => string };
    };
    expect(overrides.locateFile('zxing_reader.wasm', 'https://cdn/')).toBe('/zxing_reader.wasm');
    expect(overrides.locateFile('zxing_reader.js', 'https://cdn/')).toBe(
      'https://cdn/zxing_reader.js'
    );
  });

  it("uses the browser's own detector where it reads QR codes", async () => {
    const native = vi.fn(async () => [{ rawValue: 'NATIV' }, { rawValue: '' }]);
    (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = class {
      static getSupportedFormats = async () => ['qr_code', 'ean_13'];
      detect = native;
    };
    getUserMedia.mockResolvedValue(fakeCamera().stream);
    detected.values = ['ZXING'];
    const onScan = vi.fn();
    render(<QRCodeScanner onScanSuccess={onScan} />);
    await waitFor(() => expect(onScan).toHaveBeenCalledWith('NATIV'));
    expect(onScan).not.toHaveBeenCalledWith('ZXING');
    // Empty results are not passed on
    expect(onScan).not.toHaveBeenCalledWith('');
  });

  it('falls back to ZXing where the browser detector reads no QR codes', async () => {
    (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = class {
      static getSupportedFormats = async () => ['ean_13'];
    };
    getUserMedia.mockResolvedValue(fakeCamera().stream);
    detected.values = ['ZXING'];
    const onScan = vi.fn();
    render(<QRCodeScanner onScanSuccess={onScan} />);
    await waitFor(() => expect(onScan).toHaveBeenCalledWith('ZXING'));
  });

  it('waits for the first video frame before reading', async () => {
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
      get: () => 1,
      configurable: true,
    });
    getUserMedia.mockResolvedValue(fakeCamera().stream);
    detected.values = ['ZU FRUEH'];
    const onScan = vi.fn();
    render(<QRCodeScanner onScanSuccess={onScan} />);
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(onScan).not.toHaveBeenCalled();
  });
});
