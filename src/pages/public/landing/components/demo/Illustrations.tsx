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

/** Grip of the swept-back handlebar in the 240x150 viewBox; tags hang from here. */
const TAG_ANCHOR = { left: `${(142 / 240) * 100}%`, top: `${(38 / 150) * 100}%` };

/** Old Dutch city bike (step-through frame, rack, chain guard, basket). viewBox 240x150. */
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
        <path d="M152.3 76.3 A42 42 0 0 1 223.4 98.7" />
      </g>

      {/* rear rack */}
      <path d="M99 60 L38 60 M48 60 L58 104 M38 60 L36 66" strokeWidth="2.5" />

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

      {/* sprung saddle, swept-back handlebar, lamp, crank */}
      <path d="M98 52 L95 40" strokeWidth="3.5" />
      <path d="M79 38 Q95 30 111 37 L102 42 Q90 44 79 38 Z" fill="currentColor" strokeWidth="2" />
      <path d="M86 42 l2 4 l2 -4 l2 4" strokeWidth="1.5" />
      <path d="M168 46 L166 34" strokeWidth="3.5" />
      <path d="M166 34 C160 26 148 28 142 38" strokeWidth="4" />
      <circle
        cx="182"
        cy="56"
        r="4.5"
        strokeWidth="2"
        className="fill-amber-300 text-foreground/60"
      />
      <path d="M174 62 L179 58" strokeWidth="2" />
      <circle cx="112" cy="106" r="8" strokeWidth="3" />
      <path d="M106 116 L118 96" strokeWidth="3" />

      {/* wicker basket */}
      <g strokeWidth="2.2" className="text-amber-700 dark:text-amber-500">
        <path d="M178 34 L212 34 L208 58 L182 58 Z" />
        <path d="M181 42 L210 42 M182 50 L209 50 M189 34 L190 58 M197 34 L197 58 M205 34 L203 58" />
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
  price: string;
  className?: string;
  /** Overlay over the QR code, e.g. a scan line */
  overlay?: ReactNode;
  children?: ReactNode;
}

/** Small BazarPro hang tag on a string, as attached to the bike's handlebar. */
export function HangTag({ price, className, overlay, children }: HangTagProps) {
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
        <p className="mt-0.5 text-center text-[0.6rem] font-extrabold tabular-nums leading-none">
          {price}
        </p>
        {children}
      </div>
    </div>
  );
}

/** Phone frame used for camera and scanner screens. */
export function PhoneFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-[1.75rem] border-[5px] border-zinc-800 bg-zinc-950 p-1.5 shadow-2xl dark:border-zinc-600',
        className
      )}
    >
      <div className="relative overflow-hidden rounded-[1.25rem] bg-zinc-900">
        <span className="absolute left-1/2 top-1.5 z-20 h-1 w-10 -translate-x-1/2 rounded-full bg-zinc-700" />
        {children}
      </div>
    </div>
  );
}
