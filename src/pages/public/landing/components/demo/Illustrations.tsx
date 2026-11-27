import { BrandMark } from '../../../../../components/layout/BrandMark';
import { PrintedLabel } from '../../../../../components/products/PrintedLabel';
import type { CSSProperties, ReactNode } from 'react';
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

/** The sort mark of the examples, the same as in the wizard and on the features page */
export const EXAMPLE_SORT_CODE = 66_647;
/** Another seller's mark, clearly different: digit, colors, letters and number */
export const OTHER_SORT_CODE = 40_512;

interface HangTagProps {
  /** As on the label sheet: `small` (clothes, landscape) or `standard` (large labels) */
  format?: 'small' | 'standard';
  title: string;
  /** e.g. the size of clothes, printed big on small labels */
  size?: string;
  /** Printed without "€" on small labels, as on the sheet */
  price?: number;
  /** The seller's sort mark, to sort the unsold items back */
  sortCode?: number;
  className?: string;
  /** Overlay over the QR code, e.g. a scan line */
  overlay?: ReactNode;
  /** e.g. a width that follows the scene */
  style?: CSSProperties;
}

/**
 * A label as it comes out of the printer (PrintedLabel, the layout of the PDF), hanging on
 * a string. Everything scales with the tag's width.
 */
export function HangTag({
  format = 'standard',
  title,
  size,
  price,
  sortCode,
  className,
  overlay,
  style,
}: HangTagProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center',
        format === 'small' ? 'w-[5.5rem]' : 'w-[4.5rem]',
        className
      )}
      style={style}
    >
      {/* The string in tag yellow, like the one of the logo */}
      <span className="h-3 w-0.5 rounded-full bg-tag" />
      <PrintedLabel
        format={format}
        label={{ title, size, price, sortCode }}
        overlay={overlay}
        className="w-full rounded-[3px] shadow-lg ring-1 ring-black/10"
      />
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
  short = false,
}: {
  children: ReactNode;
  className?: string;
  screenClassName?: string;
  /** On small screens a shorter screen: the phone is wider there, the content stays the same */
  short?: boolean;
}) {
  return (
    <div
      className={cn(
        'relative rounded-[1.9rem]',
        short ? 'aspect-[71.6/124] sm:aspect-[71.6/147.6]' : 'aspect-[71.6/147.6]',
        'bg-zinc-900 p-[5px] shadow-2xl ring-1 ring-black/20 dark:bg-zinc-700 dark:ring-white/10',
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
      <BrandMark compact className="h-3 w-3" />
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

/** Where the tag of the raincoat hangs in the 160x170 viewBox: from its right shoulder. */
const RACK_TAG_ANCHOR = { left: `${(80 / 160) * 100}%`, top: `${(40 / 170) * 100}%` };

/** Wire hanger on the rail, centered on x, hook at the top of the viewBox. */
function Hanger({ x, y = 32 }: { x: number; y?: number }) {
  return (
    <g strokeWidth="1.6" className="text-foreground/60">
      <path d={`M${x} ${y - 10} C${x} ${y - 16} ${x + 6} ${y - 16} ${x + 6} ${y - 12}`} />
      <path d={`M${x} ${y - 10} L${x} ${y - 6}`} />
    </g>
  );
}

/**
 * Clothes rack of a kids' bazaar: a yellow raincoat in front (it gets the tag), a
 * striped shirt and a dress behind it. viewBox 160x170; works in both themes.
 */
export function ClothingRackIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 170"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('text-foreground/80', className)}
      aria-hidden="true"
    >
      {/* rack: rail, posts and feet */}
      <g strokeWidth="3" className="text-zinc-500 dark:text-zinc-400">
        <path d="M8 14 L152 14" />
        <path d="M12 14 L12 162 M148 14 L148 162" />
        <path d="M2 164 L22 164 M138 164 L158 164" strokeWidth="3.5" />
      </g>

      {/* dress, at the back */}
      <Hanger x={124} />
      <g strokeWidth="1.6">
        <path
          d="M112 24 L136 24 L134 40 L146 96 Q124 102 102 96 L114 40 Z"
          fill="currentColor"
          className="text-rose-300 dark:text-rose-400"
        />
        <path d="M114 40 L134 40" className="text-rose-500" />
        <path d="M116 24 Q124 32 132 24" className="text-rose-500" />
      </g>

      {/* striped shirt */}
      <Hanger x={98} />
      <g strokeWidth="1.6">
        <path
          d="M86 24 Q98 30 110 24 L124 32 L128 50 L118 52 L116 44 L116 90 L80 90 L80 44 L78 52 L68 50 L72 32 Z"
          fill="currentColor"
          className="text-sky-200 dark:text-sky-300"
        />
        <path
          d="M80 54 L116 54 M80 64 L116 64 M80 74 L116 74 M80 84 L116 84 M72 40 L124 40"
          strokeWidth="3"
          className="text-sky-500 dark:text-sky-600"
        />
      </g>

      {/* raincoat, in front: hood folded back, toggles, pockets */}
      <Hanger x={48} />
      <g strokeWidth="2">
        <path
          d="M36 26 Q48 18 60 26 L58 32 L38 32 Z"
          fill="currentColor"
          className="text-yellow-500 dark:text-yellow-500"
        />
        <path
          d="M38 26 Q48 34 58 26 L76 34 Q82 38 83 46 L90 98 L78 101 L72 58 L75 138 Q48 145 21 138 L24 58 L18 101 L6 98 L13 46 Q14 38 20 34 Z"
          fill="currentColor"
          className="text-yellow-300 dark:text-yellow-400"
        />
        <g className="text-yellow-700">
          <path d="M38 26 Q48 34 58 26 L76 34 Q82 38 83 46 L90 98 L78 101 L72 58 L75 138 Q48 145 21 138 L24 58 L18 101 L6 98 L13 46 Q14 38 20 34 Z" />
          <path d="M48 31 L48 140" strokeWidth="1.6" />
          <path d="M24 58 Q22 52 20 46 M72 58 Q74 52 76 46" strokeWidth="1.4" />
          <path
            d="M28 104 L42 104 L42 120 L28 120 Z M54 104 L68 104 L68 120 L54 120 Z"
            strokeWidth="1.6"
          />
          <path d="M28 108 L42 108 M54 108 L68 108" strokeWidth="1.4" />
          <path d="M7 92 L18 95 M79 95 L89 92" strokeWidth="1.4" />
        </g>
        <g strokeWidth="1" fill="currentColor" className="text-amber-900">
          <rect x="44" y="50" width="8" height="3" rx="1.5" />
          <rect x="44" y="68" width="8" height="3" rx="1.5" />
          <rect x="44" y="86" width="8" height="3" rx="1.5" />
        </g>
      </g>
    </svg>
  );
}

/** Clothes rack with an optional element (usually a HangTag) at the raincoat's shoulder. */
export function RackWithTag({ tag, className }: { tag?: ReactNode; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <ClothingRackIllustration className="w-full" />
      {tag && (
        <div className="absolute -translate-x-1/2" style={RACK_TAG_ANCHOR}>
          {tag}
        </div>
      )}
    </div>
  );
}

/** "Photo" of the raincoat for the cart (same colors in both themes). */
export function RaincoatThumb({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center bg-yellow-50', className)}>
      <svg viewBox="4 16 88 130" className="h-full" aria-hidden="true">
        <path
          d="M38 26 Q48 34 58 26 L76 34 Q82 38 83 46 L90 98 L78 101 L72 58 L75 138 Q48 145 21 138 L24 58 L18 101 L6 98 L13 46 Q14 38 20 34 Z"
          fill="#fde047"
          stroke="#a16207"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path d="M48 31 L48 140" stroke="#a16207" strokeWidth="2.5" />
      </svg>
    </div>
  );
}
