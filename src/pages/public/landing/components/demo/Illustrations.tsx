import { ShoppingBag } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { ReactNode } from 'react';
import { cn } from '../../../../../lib/utils';

/*
 * Illustrations for the landing page story: an old city bike gets a BazarPro
 * hang tag. Drawn as SVG so they scale, stay license-free and work in both
 * themes (frame in a muted retro green, lines in currentColor).
 */

const SPOKE_ANGLES = [0, 30, 60, 90, 120, 150];

function Wheel({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r="38" strokeWidth="5" />
      <circle cx={cx} cy={cy} r="33" strokeWidth="1.2" opacity="0.5" />
      {SPOKE_ANGLES.map((angle) => {
        const rad = (angle * Math.PI) / 180;
        const dx = Math.cos(rad) * 33;
        const dy = Math.sin(rad) * 33;
        return (
          <line
            key={angle}
            x1={cx - dx}
            y1={cy - dy}
            x2={cx + dx}
            y2={cy + dy}
            strokeWidth="0.9"
            opacity="0.45"
          />
        );
      })}
      <circle cx={cx} cy={cy} r="3.5" fill="currentColor" stroke="none" />
    </g>
  );
}

/** Handlebar grip in the 240x150 viewBox; tags hang from here. */
const TAG_ANCHOR = { left: `${(142 / 240) * 100}%`, top: `${(35 / 150) * 100}%` };

/** Old Dutch city bike: step-through frame, sprung saddle, rear basket, lamp. viewBox 240x150. */
export function BikeIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 150"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('text-foreground/80', className)}
      aria-hidden="true"
    >
      <Wheel cx={58} cy={106} />
      <Wheel cx={182} cy={106} />

      {/* fenders */}
      <g strokeWidth="3.5" className="text-emerald-800 dark:text-emerald-600">
        <path d="M16.6 98.7 A42 42 0 0 1 87.7 76.3" />
        <path d="M152.3 76.3 A42 42 0 0 1 189.3 64.6" />
      </g>

      {/* rear rack */}
      <path d="M99 60 L36 60 M46 60 L58 104" strokeWidth="2.5" />

      {/* step-through frame */}
      <g className="text-emerald-700 dark:text-emerald-500" strokeWidth="5">
        <path d="M168 46 L174 66" />
        <path d="M174 66 Q178 88 182 106" />
        <path d="M170 54 Q122 64 110 104" />
        <path d="M172 62 Q130 78 115 106" />
        <path d="M112 106 L98 52" />
        <path d="M58 106 L99 58" />
        <path d="M58 106 L112 106" />
      </g>

      {/* chain guard */}
      <path
        d="M54 99 L114 99 Q121 106 114 113 L54 113 Q48 106 54 99 Z"
        strokeWidth="2"
        fill="currentColor"
        className="text-emerald-800/80 dark:text-emerald-700/80"
      />

      {/* leather saddle on coil springs */}
      <path d="M98 52 L96 41" strokeWidth="3.5" />
      <path d="M85 43 L97 40" strokeWidth="2" />
      <path
        d="M85 38.5 v1.5 m0 1.5 v1.5 M90 38.5 v1.5 m0 1.5 v1.5"
        strokeWidth="2.5"
        className="text-foreground/60"
      />
      <path
        d="M79 35 C79 31 85 29.5 93 30.5 L109 33 C111.5 33.5 111.5 36 109 36.5 L95 38 C88 39.5 80 39.5 79 35 Z"
        fill="currentColor"
        strokeWidth="1.5"
        className="text-amber-900 dark:text-amber-700"
      />

      {/* swept-back handlebar with grip */}
      <path d="M168 46 L167 36" strokeWidth="3.5" />
      <path d="M167 36 C163 28 152 27 146 31" strokeWidth="3.5" />
      <path d="M146 31 L139 37" strokeWidth="6" className="text-amber-900 dark:text-amber-700" />

      {/* front lamp on the head tube */}
      <path d="M170 51 L176 51" strokeWidth="2" />
      <path
        d="M176 46.5 L183 48 L183 54 L176 55.5 Z"
        strokeWidth="1.5"
        className="fill-amber-300 text-foreground/70"
      />

      {/* chainring, cranks and pedals */}
      <circle cx="112" cy="106" r="8" strokeWidth="2.5" />
      <circle cx="112" cy="106" r="2" fill="currentColor" stroke="none" />
      <path d="M112 106 L121 96 M112 106 L103 116" strokeWidth="3" />
      <path
        d="M116.5 96 L125.5 96 M98.5 116 L107.5 116"
        strokeWidth="4"
        className="text-foreground/70"
      />

      {/* wicker basket on the rear rack */}
      <g strokeWidth="2.2" className="text-amber-700 dark:text-amber-500">
        <path d="M38 40 L76 40 L73 59 L41 59 Z" />
        <path d="M39 46.5 L75 46.5 M40 53 L74 53 M47 40 L48 59 M56 40 L56.5 59 M65 40 L65 59" />
      </g>
    </svg>
  );
}

/** Bike with an optional element (usually a HangTag) hanging from the handlebar grip. */
export function BikeWithTag({ tag, className }: { tag?: ReactNode; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <BikeIllustration className="w-full" />
      {tag && (
        <div className="absolute -translate-x-1/2" style={TAG_ANCHOR}>
          {tag}
        </div>
      )}
    </div>
  );
}

interface HangTagProps {
  /** Article number; the price is not printed because sellers can change it (discounts) */
  itemNumber: string;
  className?: string;
  /** Overlay over the QR code, e.g. a scan line */
  overlay?: ReactNode;
}

/** Small BazarPro hang tag on a string, as attached to the bike's handlebar. */
export function HangTag({ itemNumber, className, overlay }: HangTagProps) {
  return (
    <div className={cn('flex w-[3.6rem] flex-col items-center', className)}>
      <span className="h-3 w-px bg-foreground/60" />
      <div className="relative w-full rounded-md bg-white p-1 text-zinc-900 shadow-lg ring-1 ring-black/10">
        <span className="absolute left-1/2 top-0.5 h-1 w-1 -translate-x-1/2 rounded-full bg-zinc-300" />
        <div className="relative mt-1 overflow-hidden rounded-sm">
          <QRCodeSVG
            value="https://bazarpro.de"
            size={48}
            level="L"
            marginSize={0}
            className="h-auto w-full"
          />
          {overlay}
        </div>
        <p className="mt-0.5 text-center text-[0.5rem] font-bold tabular-nums leading-none text-zinc-600">
          {itemNumber}
        </p>
      </div>
    </div>
  );
}

/**
 * An ordinary smartphone in iPhone proportions (outer size 71.6 x 147.6 mm). Only the width varies
 * between scenes; the screen follows the theme.
 */
export function PhoneFrame({
  children,
  className,
  screenClassName,
}: {
  children: ReactNode;
  className?: string;
  screenClassName?: string;
}) {
  return (
    <div
      className={cn(
        'relative aspect-[71.6/147.6] rounded-[1.9rem] bg-zinc-900 p-[5px] shadow-2xl ring-1 ring-black/20 dark:bg-zinc-700 dark:ring-white/10',
        className
      )}
    >
      <span className="absolute -right-[3px] top-[22%] h-[9%] w-[3px] rounded-r bg-zinc-800 dark:bg-zinc-600" />
      <span className="absolute -left-[3px] top-[18%] h-[6%] w-[3px] rounded-l bg-zinc-800 dark:bg-zinc-600" />
      <div
        className={cn(
          'relative flex h-full flex-col overflow-hidden rounded-[1.55rem] bg-background text-foreground',
          screenClassName
        )}
      >
        <div className="relative z-20 flex shrink-0 items-center justify-between px-3 pb-0.5 pt-1.5 text-[0.5rem] font-semibold">
          <span>9:41</span>
          <span className="absolute left-1/2 top-1.5 h-3.5 w-[32%] -translate-x-1/2 rounded-full bg-black" />
          <span className="flex items-center gap-1">
            <span className="flex items-end gap-px" aria-hidden="true">
              <span className="h-1 w-0.5 rounded-sm bg-current" />
              <span className="h-1.5 w-0.5 rounded-sm bg-current" />
              <span className="h-2 w-0.5 rounded-sm bg-current" />
            </span>
            <span className="relative flex h-2 w-3.5 items-center rounded-[3px] border border-current p-px">
              <span className="h-full w-[80%] rounded-[1px] bg-current" />
              <span className="absolute -right-[3px] top-1/2 h-1 w-0.5 -translate-y-1/2 rounded-r-sm bg-current" />
            </span>
          </span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        <span className="mx-auto mb-1 mt-auto h-1 w-1/3 shrink-0 rounded-full bg-current opacity-30" />
      </div>
    </div>
  );
}

/** App bar of the BazarPro web app inside a phone screen. */
export function AppBar({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-1.5 border-b px-3 py-1.5">
      <ShoppingBag className="h-3 w-3 shrink-0 text-primary" />
      <span className="truncate text-[0.6rem] font-bold">{title}</span>
    </div>
  );
}

/** "Photo" of the bike outside (same colors in both themes). */
export function BikePhoto({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-end justify-center bg-gradient-to-b from-sky-200 via-sky-100 to-stone-300 px-2 pb-1.5 text-zinc-800',
        className
      )}
    >
      <BikeIllustration className="w-full text-zinc-800" />
    </div>
  );
}
