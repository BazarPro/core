import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BarcodeDetector as ZXingBarcodeDetector,
  prepareZXingModule,
} from 'barcode-detector/ponyfill';
import zxingWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { Camera, CameraOff, Flashlight, FlashlightOff, RefreshCw } from 'lucide-react';
import { Button } from './button';
import i18n from '../../i18n';

// The decoder ships with the app instead of loading from a CDN: works offline and in the app
prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith('.wasm') ? zxingWasmUrl : prefix + path,
  },
});

type Detector = Pick<ZXingBarcodeDetector, 'detect'>;

/** Pause between two reads, so a phone does not run hot at the cash desk */
const SCAN_INTERVAL_MS = 80;

/**
 * The browser's own detector where it reads QR codes (Chrome on Android uses the
 * system's), else ZXing-C++ as WebAssembly. Both read the whole camera frame.
 */
async function createDetector(): Promise<Detector> {
  const Native = (
    globalThis as {
      BarcodeDetector?: typeof ZXingBarcodeDetector;
    }
  ).BarcodeDetector;
  try {
    if (Native && (await Native.getSupportedFormats()).includes('qr_code')) {
      return new Native({ formats: ['qr_code'] });
    }
  } catch {
    // Some browsers have the API without a working implementation
  }
  return new ZXingBarcodeDetector({ formats: ['qr_code'] });
}

type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };

interface QRCodeScannerProps {
  onScanSuccess: (decodedText: string) => void;
  active?: boolean;
}

export function QRCodeScanner({ onScanSuccess, active = true }: QRCodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScanSuccess);
  const [state, setState] = useState<'starting' | 'scanning' | 'failed'>('starting');
  const [track, setTrack] = useState<MediaStreamTrack | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    onScanRef.current = onScanSuccess;
  }, [onScanSuccess]);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const scan = async (detector: Detector, video: HTMLVideoElement) => {
      if (stopped) return;
      if (video.readyState >= video.HAVE_ENOUGH_DATA) {
        try {
          for (const code of await detector.detect(video)) {
            if (code.rawValue) onScanRef.current(code.rawValue);
          }
        } catch {
          // A frame that could not be read; the next one will do
        }
      }
      timer = setTimeout(() => void scan(detector, video), SCAN_INTERVAL_MS);
    };

    const start = async () => {
      setState('starting');
      try {
        const [detector, media] = await Promise.all([
          createDetector(),
          navigator.mediaDevices.getUserMedia({
            audio: false,
            // Small labels need resolution; the browser takes what the camera has
            video: {
              facingMode: 'environment',
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          }),
        ]);
        stream = media;
        const video = videoRef.current;
        if (stopped || !video) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        const [videoTrack] = media.getVideoTracks();
        await videoTrack
          .applyConstraints({
            advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
          })
          .catch(() => {});
        video.srcObject = media;
        await video.play();
        setTrack(videoTrack);
        setState('scanning');
        void scan(detector, video);
      } catch (err) {
        console.error('Failed to start scanner:', err);
        if (!stopped) setState('failed');
      }
    };

    // Dialogs open with an animation; the camera starts once the video element is there
    const delay = setTimeout(() => void start(), 300);
    return () => {
      stopped = true;
      clearTimeout(delay);
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      setTrack(null);
      setTorchOn(false);
    };
  }, [active, attempt]);

  const hasTorch = !!(track?.getCapabilities?.() as TorchCapabilities | undefined)?.torch;

  const toggleTorch = useCallback(async () => {
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      // Torch not available after all
    }
  }, [track, torchOn]);

  return (
    <div className="flex flex-col items-center w-full">
      <div className="w-full max-w-sm aspect-square bg-black rounded-lg overflow-hidden border-2 border-primary/20 shadow-inner relative">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
          aria-label={i18n.t('scanner.title', { ns: 'organizer' })}
        />

        {state === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground bg-muted z-10">
            <Camera className="h-12 w-12 mb-2 animate-pulse text-primary/40" />
            <p className="text-sm">{i18n.t('scanner.cameraStarting', { ns: 'organizer' })}</p>
          </div>
        )}

        {state === 'failed' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-muted z-20">
            <CameraOff className="h-12 w-12 mb-4 text-destructive" />
            <p className="text-sm font-medium text-destructive mb-4">
              {i18n.t('scanner.cameraFailed', { ns: 'organizer' })}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAttempt((n) => n + 1)}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              {i18n.t('scanner.retry', { ns: 'organizer' })}
            </Button>
          </div>
        )}

        {state === 'scanning' && (
          <>
            {/* Guide only: the whole frame is read */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-3/5 aspect-square border-2 border-white/70 rounded-lg shadow-[0_0_0_999px_rgba(0,0,0,0.25)]" />
            </div>
            {hasTorch && (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute bottom-3 right-3 z-10 rounded-full"
                onClick={() => void toggleTorch()}
                aria-pressed={torchOn}
                aria-label={i18n.t(torchOn ? 'scanner.torchOff' : 'scanner.torchOn', {
                  ns: 'organizer',
                })}
              >
                {torchOn ? (
                  <FlashlightOff className="h-4 w-4" />
                ) : (
                  <Flashlight className="h-4 w-4" />
                )}
              </Button>
            )}
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-4 text-center px-4">
        {i18n.t('scanner.hint', { ns: 'organizer' })}
      </p>
    </div>
  );
}
