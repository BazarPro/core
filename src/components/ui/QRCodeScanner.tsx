import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Button } from './button';
import { Camera, CameraOff, RefreshCw } from 'lucide-react';

interface QRCodeScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanFailure?: (errorMessage: string) => void;
  active?: boolean;
}

export function QRCodeScanner({ onScanSuccess, onScanFailure, active = true }: QRCodeScannerProps) {
  const [isScannerStarted, setIsScannerStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isTransitioning = useRef(false);
  const elementId = 'qr-reader-container';

  const stopScanner = useCallback(async () => {
    if (isTransitioning.current) return;

    try {
      if (scannerRef.current && scannerRef.current.isScanning) {
        isTransitioning.current = true;
        await scannerRef.current.stop();
        setIsScannerStarted(false);
      }
    } catch (err) {
      console.error('Failed to stop scanner:', err);
    } finally {
      isTransitioning.current = false;
    }
  }, []);

  const startScanner = useCallback(async () => {
    if (isTransitioning.current) return;

    try {
      const element = document.getElementById(elementId);
      if (!element) return;

      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(elementId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        });
      }

      if (scannerRef.current.isScanning) return;

      isTransitioning.current = true;

      // We explicitly request a 1:1 aspect ratio. This often helps the browser
      // choose a more appropriate resolution/orientation for the container.
      await scannerRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
          // videoConstraints can help force the right orientation on some browsers
          videoConstraints: {
            facingMode: 'environment',
            aspectRatio: 1.0,
          },
        },
        (decodedText) => {
          onScanSuccess(decodedText);
        },
        (errorMessage) => {
          if (onScanFailure) onScanFailure(errorMessage);
        }
      );
      setIsScannerStarted(true);
      setError(null);
    } catch (err) {
      console.error('Failed to start scanner:', err);
      if (typeof err === 'string' && err.includes('already under transition')) {
        return;
      }
      setError('Kamera konnte nicht gestartet werden. Bitte Berechtigungen prüfen.');
      setIsScannerStarted(false);
    } finally {
      isTransitioning.current = false;
    }
  }, [onScanSuccess, onScanFailure]);

  useEffect(() => {
    if (active) {
      const timer = setTimeout(() => {
        startScanner();
      }, 300);
      return () => {
        clearTimeout(timer);
        stopScanner();
      };
    } else {
      stopScanner();
    }
  }, [active, startScanner, stopScanner]);

  const handleRetry = () => {
    setError(null);
    startScanner();
  };

  return (
    <div className="flex flex-col items-center w-full">
      <div className="w-full max-w-sm aspect-square bg-black rounded-lg overflow-hidden border-2 border-primary/20 shadow-inner relative">
        {/* 
          The actual scanner target. 
          The CSS below ensures the video is centered and covers the area.
          We also prevent any automatic browser transforms that might cause 90deg rotation.
        */}
        <div
          id={elementId}
          className="w-full h-full [&_video]:object-cover [&_video]:w-full [&_video]:h-full [&_video]:!transform-none"
        />

        {/* Status Overlays */}
        {!isScannerStarted && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground bg-muted z-10">
            <Camera className="h-12 w-12 mb-2 animate-pulse text-primary/40" />
            <p className="text-sm">Kamera wird gestartet...</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-muted z-20">
            <CameraOff className="h-12 w-12 mb-4 text-destructive" />
            <p className="text-sm font-medium text-destructive mb-4">{error}</p>
            <Button variant="outline" size="sm" onClick={handleRetry} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Erneut versuchen
            </Button>
          </div>
        )}

        {isScannerStarted && (
          <div className="absolute inset-0 border-[30px] border-black/40 pointer-events-none flex items-center justify-center">
            <div className="w-[200px] h-[200px] border-2 border-primary/50 rounded-lg shadow-[0_0_0_999px_rgba(0,0,0,0.2)]" />
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-4 text-center px-4">
        QR-Code mittig im Quadrat platzieren. Er wird automatisch erkannt.
      </p>
    </div>
  );
}
