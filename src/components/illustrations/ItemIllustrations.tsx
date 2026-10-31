import { BikeIllustration } from '../../pages/public/landing/components/demo/Illustrations';
import { cn } from '../utils';

/*
 * Drawn items for the creation wizard: what sellers bring to each kind of bazaar. SVG like
 * the bike of the landing page, so they scale, stay license-free and work in both themes.
 */

export type ItemKind = 'kids' | 'clothing' | 'ski' | 'bike';

const svgProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

/** Children's T-shirt with a star and small dungarees. viewBox 240x150. */
function KidsClothes({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 150" className={className} {...svgProps}>
      <g strokeWidth="3">
        <path
          d="M38 38 L64 26 Q76 36 88 26 L114 38 L104 62 L94 58 L94 124 L58 124 L58 58 L48 62 Z"
          className="fill-amber-300 text-amber-700"
        />
        <path
          d="M76 70 l5 10 11 1.5 -8 7.5 2 11 -10 -5.5 -10 5.5 2 -11 -8 -7.5 11 -1.5 z"
          className="fill-white/90 text-amber-700"
          strokeWidth="2"
        />
      </g>
      <g strokeWidth="3">
        <path
          d="M140 44 L148 44 L152 64 L186 64 L190 44 L198 44 L196 70 L200 126 L176 126 L169 96 L162 126 L138 126 L142 70 Z"
          className="fill-sky-400 text-sky-800"
        />
        <rect
          x="155"
          y="72"
          width="28"
          height="18"
          rx="3"
          className="fill-sky-300 text-sky-800"
          strokeWidth="2.5"
        />
        <circle cx="150" cy="58" r="2.5" className="fill-white text-sky-800" strokeWidth="1.5" />
        <circle cx="190" cy="58" r="2.5" className="fill-white text-sky-800" strokeWidth="1.5" />
      </g>
    </svg>
  );
}

/** Jacket on a hanger next to a folded sweater. viewBox 240x150. */
function ClothingOnHanger({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 150" className={className} {...svgProps}>
      <g strokeWidth="3" className="text-zinc-700">
        <path d="M104 22 q0 -10 8 -10 q8 0 8 8 q0 6 -8 10 L112 34" />
        <path d="M60 52 L112 32 L164 52" />
      </g>
      <g strokeWidth="3">
        <path
          d="M66 50 L96 38 L112 58 L128 38 L158 50 L164 132 L60 132 Z"
          className="fill-rose-400 text-rose-800"
        />
        <path d="M112 58 L112 132" className="text-rose-800" strokeWidth="2.5" />
        <circle cx="120" cy="80" r="2.5" className="fill-white text-rose-800" strokeWidth="1.5" />
        <circle cx="120" cy="100" r="2.5" className="fill-white text-rose-800" strokeWidth="1.5" />
      </g>
      <g strokeWidth="3">
        <path d="M172 104 h50 v28 h-50 z" className="fill-emerald-300 text-emerald-800" />
        <path d="M172 116 h50" className="text-emerald-800" strokeWidth="2" />
      </g>
    </svg>
  );
}

/** Crossed skis, poles and a ski boot. viewBox 240x150. */
function SkiSet({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 150" className={className} {...svgProps}>
      <g strokeWidth="3">
        <path
          d="M44 128 L150 14 q6 -4 9 1 L58 136 q-10 4 -14 -8 z"
          className="fill-sky-500 text-sky-900"
        />
        <path
          d="M70 136 L176 22 q6 -4 9 1 L84 144 q-10 4 -14 -8 z"
          className="fill-orange-400 text-orange-900"
        />
      </g>
      <g strokeWidth="2.5" className="text-zinc-700">
        <path d="M30 20 L70 140" />
        <path d="M24 30 h14" />
      </g>
      <g strokeWidth="3">
        <path
          d="M168 66 h26 l4 34 q20 2 22 18 v12 h-58 z"
          className="fill-zinc-700 text-zinc-900"
        />
        <path d="M168 80 h28 M168 94 h30" className="text-zinc-400" strokeWidth="2.5" />
      </g>
    </svg>
  );
}

const BACKDROPS: Record<ItemKind, string> = {
  kids: 'from-amber-100 via-orange-50 to-rose-100',
  clothing: 'from-rose-100 via-stone-50 to-emerald-100',
  ski: 'from-sky-200 via-white to-slate-200',
  bike: 'from-sky-200 via-sky-100 to-stone-300',
};

/** The item as a "photo": drawn on a light backdrop, the same in both themes. */
export function ItemPhoto({ kind, className }: { kind: ItemKind; className?: string }) {
  const drawing = 'h-full w-full';
  return (
    <div
      className={cn(
        'flex items-center justify-center bg-gradient-to-b px-3 py-2 text-zinc-800',
        BACKDROPS[kind],
        className
      )}
    >
      {kind === 'kids' && <KidsClothes className={drawing} />}
      {kind === 'clothing' && <ClothingOnHanger className={drawing} />}
      {kind === 'ski' && <SkiSet className={drawing} />}
      {kind === 'bike' && <BikeIllustration className={cn(drawing, 'text-zinc-800')} />}
    </div>
  );
}
