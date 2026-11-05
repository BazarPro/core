import { useMemo } from 'react';
import { qrRuns, screenQr } from '../../lib/qrCode';

/**
 * Every QR code in the app. It comes from the same code as the printed labels, so they all
 * look alike and keep their light border. On white in every theme, as scanners need it.
 */
export function QrCode({ value, className }: { value: string; className?: string }) {
  const { path, box } = useMemo(() => {
    const { runs, total } = qrRuns(screenQr(value));
    return {
      box: total,
      path: runs.map(({ x, y, width }) => `M${x} ${y}h${width}v1h-${width}Z`).join(''),
    };
  }, [value]);
  return (
    <svg
      viewBox={`0 0 ${box} ${box}`}
      role="img"
      aria-label="QR-Code"
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={box} height={box} fill="white" />
      <path d={path} fill="black" />
    </svg>
  );
}
