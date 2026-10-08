import { QRCodeSVG } from 'qrcode.react';
import type { ReactNode } from 'react';
import { cn } from '../../../../../lib/utils';

interface PriceTagProps {
  title: string;
  price: string;
  seller: string;
  qrSize?: number;
  className?: string;
  /** Overlay over the QR code, e.g. an animated scan line */
  qrOverlay?: ReactNode;
}

/** Printed BazarPro label as sellers attach it to their items (always paper white). */
export function PriceTag({
  title,
  price,
  seller,
  qrSize = 76,
  className,
  qrOverlay,
}: PriceTagProps) {
  return (
    <div
      className={cn(
        'relative flex items-center gap-3 rounded-xl bg-white p-3 text-zinc-900 shadow-lg ring-1 ring-black/10',
        className
      )}
    >
      <span className="absolute left-2 top-2 h-2 w-2 rounded-full bg-zinc-200 ring-1 ring-zinc-300" />
      <div className="relative shrink-0 overflow-hidden rounded-md">
        <QRCodeSVG value="https://bazarpro.de" size={qrSize} level="L" marginSize={1} />
        {qrOverlay}
      </div>
      <div className="min-w-0 space-y-1">
        <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-500">
          {seller}
        </p>
        <p className="truncate text-sm font-semibold leading-tight">{title}</p>
        <p className="text-xl font-extrabold tabular-nums leading-none">{price}</p>
      </div>
    </div>
  );
}
