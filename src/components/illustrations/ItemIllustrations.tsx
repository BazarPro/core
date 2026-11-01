import type { ReactNode } from 'react';
import { BikeIllustration } from '../../pages/public/landing/components/demo/Illustrations';
import { cn } from '../utils';

/*
 * Drawn items for the creation wizard and the landing page: what sellers bring to each
 * kind of bazaar. SVG like the bike of the landing page, so they scale, stay license-free
 * and look the same in both themes (they sit on a light backdrop). Every drawing uses the
 * same 200x150 box with the item centered, so they line up at any size.
 */

export type ItemKind = 'kids' | 'clothing' | 'ski' | 'bike';

export type ItemDrawingId =
  | 'kidsClothes'
  | 'toyBricks'
  | 'rainBoots'
  | 'jacket'
  | 'ankleBoots'
  | 'handbag'
  | 'skis'
  | 'skiBoots'
  | 'skiHelmet'
  | 'cityBike'
  | 'kidsBike'
  | 'bikeHelmet';

/** The three example items of each kind, in the order of eventTypes.<id>.exampleItems. */
const KIND_ITEMS: Record<ItemKind, [ItemDrawingId, ItemDrawingId, ItemDrawingId]> = {
  kids: ['kidsClothes', 'toyBricks', 'rainBoots'],
  clothing: ['jacket', 'ankleBoots', 'handbag'],
  ski: ['skis', 'skiBoots', 'skiHelmet'],
  bike: ['cityBike', 'kidsBike', 'bikeHelmet'],
};

const INK = '#27272a';

function Svg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 200 150"
      fill="none"
      stroke={INK}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Children's T-shirt with a dino print and dungarees with bib pocket. */
function KidsClothes() {
  return (
    <>
      {/* T-shirt */}
      <path
        d="M30 44 L52 34 Q64 44 76 34 L98 44 L92 66 L84 63 L84 120 Q64 124 44 120 L44 63 L36 66 Z"
        fill="#fbbf24"
      />
      <path d="M52 34 Q64 48 76 34" fill="#f59e0b" />
      <path d="M36 66 L40 52 M92 66 L88 52" strokeWidth="1.8" opacity="0.6" />
      {/* dino print */}
      <path
        d="M52 98 q0 -12 10 -12 q4 -8 10 -4 q4 2 2 6 l-4 1 q4 4 2 9 l-2 8 h-3 l-1 -6 h-6 l-1 6 h-3 l0 -8 q-5 0 -4 0 z"
        fill="#16a34a"
        strokeWidth="1.6"
      />
      <circle cx="71" cy="84" r="0.9" fill={INK} stroke="none" />
      {/* dungarees */}
      <path d="M118 34 L124 62 M162 34 L156 62" stroke="#1d4ed8" strokeWidth="5" />
      <circle cx="124" cy="60" r="2.4" fill="#e5e7eb" strokeWidth="1.4" />
      <circle cx="156" cy="60" r="2.4" fill="#e5e7eb" strokeWidth="1.4" />
      <path
        d="M120 58 L160 58 L160 76 Q166 78 168 84 L172 126 L148 126 L142 98 L138 98 L132 126 L108 126 L112 84 Q114 78 120 76 Z"
        fill="#3b82f6"
      />
      <rect x="130" y="64" width="20" height="14" rx="2" fill="#60a5fa" strokeWidth="1.8" />
      <path d="M112 118 L132 118 M148 118 L171 118" stroke="#1e3a8a" strokeWidth="1.6" />
      <path d="M140 84 L140 98" strokeWidth="1.6" opacity="0.6" />
    </>
  );
}

/** One plastic brick from the front: body and studs on top. */
function Brick({
  x,
  y,
  studs,
  fill,
  shade,
}: {
  x: number;
  y: number;
  studs: number;
  fill: string;
  shade: string;
}) {
  const width = studs * 16;
  return (
    <g>
      {Array.from({ length: studs }, (_, i) => (
        <rect key={i} x={x + 3 + i * 16} y={y - 5} width="10" height="6" rx="1.5" fill={fill} />
      ))}
      <rect x={x} y={y} width={width} height="20" rx="2" fill={fill} />
      <path d={`M${x + 2} ${y + 16} H${x + width - 2}`} stroke={shade} strokeWidth="2" />
    </g>
  );
}

/** A small stack of building bricks and a loose one. */
function ToyBricks() {
  return (
    <>
      <Brick x={36} y={106} studs={6} fill="#ef4444" shade="#b91c1c" />
      <Brick x={52} y={81} studs={3} fill="#facc15" shade="#ca8a04" />
      <Brick x={100} y={81} studs={2} fill="#22c55e" shade="#15803d" />
      <Brick x={68} y={56} studs={4} fill="#3b82f6" shade="#1d4ed8" />
      <Brick x={140} y={106} studs={2} fill="#f97316" shade="#c2410c" />
    </>
  );
}

/** One rubber boot, toe to the left, in a 70x100 box. */
function RubberBoot({ x, y, fill, shade }: { x: number; y: number; fill: string; shade: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M24 4 L60 4 L62 72 Q64 80 64 88 L4 88 Q2 74 16 70 Q24 66 24 56 Z" fill={fill} />
      <path d="M22 4 H62 V12 H22 Z" fill={shade} />
      <path d="M60 14 q8 2 6 12 q-2 4 -6 3" fill={fill} strokeWidth="2" />
      <path d="M2 88 H66 V96 Q34 100 2 96 Z" fill="#3f3f46" />
      <path
        d="M10 96 l3 -4 M20 97 l3 -4 M30 97 l3 -4 M40 97 l3 -4 M50 97 l3 -4"
        stroke="#a1a1aa"
        strokeWidth="1.4"
      />
    </g>
  );
}

/** A pair of children's rubber boots. */
function RainBoots() {
  return (
    <>
      <RubberBoot x={76} y={22} fill="#fde047" shade="#eab308" />
      <RubberBoot x={46} y={30} fill="#facc15" shade="#ca8a04" />
    </>
  );
}

/** A zipped jacket on a hanger: hood behind the collar, sleeves with cuffs, pockets. */
function Jacket() {
  return (
    <>
      <path d="M100 24 q0 -12 9 -12 q8 0 8 8 q0 7 -9 9 L100 32" />
      <path d="M84 40 Q84 22 100 22 Q116 22 116 40" fill="#9f1239" />
      <path d="M58 46 L100 32 L142 46" strokeWidth="3" />
      {/* sleeves */}
      <path d="M64 46 L46 58 L38 116 Q44 120 52 118 L60 76 Z" fill="#be123c" />
      <path d="M136 46 L154 58 L162 116 Q156 120 148 118 L140 76 Z" fill="#be123c" />
      <path
        d="M38 116 L39 108 Q45 111 53 110 L52 118 Q44 120 38 116 Z"
        fill="#881337"
        strokeWidth="1.8"
      />
      <path
        d="M162 116 L161 108 Q155 111 147 110 L148 118 Q156 120 162 116 Z"
        fill="#881337"
        strokeWidth="1.8"
      />
      {/* body */}
      <path d="M64 46 L88 38 L100 50 L112 38 L136 46 L142 130 L58 130 Z" fill="#e11d48" />
      <path d="M88 38 Q100 30 112 38 L100 50 Z" fill="#881337" />
      <path d="M100 50 V130" stroke="#fde68a" strokeWidth="2" />
      <rect x="97" y="56" width="6" height="8" rx="1.5" fill="#fde68a" strokeWidth="1.4" />
      <path d="M70 94 L88 92 M112 92 L130 94" strokeWidth="2.2" />
      <path d="M58 122 H142" stroke="#881337" strokeWidth="2" />
    </>
  );
}

/** One Chelsea boot, toe to the left, in an 80x90 box: elastic insert, pull tab, block heel. */
function ChelseaBoot({ x, y, fill, shade }: { x: number; y: number; fill: string; shade: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M58 10 V2 Q58 -2 62 -2 H66 Q70 -2 70 2 V10" fill={shade} strokeWidth="2" />
      <path
        d="M30 8 L68 8 Q70 34 70 60 L72 76 L6 76 Q0 76 0 70 Q0 62 12 58 L26 52 Q30 50 30 42 Z"
        fill={fill}
      />
      <path d="M40 10 L58 10 L52 46 L46 46 Z" fill={shade} strokeWidth="1.8" />
      <path d="M45 14 L48 42 M49 14 L50 42 M53 14 L51 42" stroke={fill} strokeWidth="1" />
      <path d="M8 62 Q18 58 28 56" stroke={shade} strokeWidth="1.6" strokeDasharray="2 2.5" />
      <path d="M-1 76 H72 V82 H-1 Z" fill="#292524" />
      <path d="M56 82 H72 V90 H58 Z" fill="#292524" />
    </g>
  );
}

/** A pair of leather Chelsea boots. */
function AnkleBoots() {
  return (
    <>
      <ChelseaBoot x={96} y={28} fill="#b45309" shade="#78350f" />
      <ChelseaBoot x={44} y={42} fill="#92400e" shade="#451a03" />
    </>
  );
}

/** A leather handbag with two handles and a flap. */
function Handbag() {
  return (
    <>
      <path d="M72 64 Q72 26 100 26 Q128 26 128 64" stroke="#78350f" strokeWidth="6" />
      <path d="M72 64 Q72 26 100 26 Q128 26 128 64" stroke="#b45309" strokeWidth="3" />
      <path d="M50 60 H150 L158 128 Q100 134 42 128 Z" fill="#d97706" />
      <path d="M50 60 H150 L146 88 Q100 98 54 88 Z" fill="#b45309" />
      <rect x="94" y="84" width="12" height="10" rx="2" fill="#fde68a" strokeWidth="1.8" />
      <path
        d="M56 66 H144 M48 122 Q100 128 152 122"
        stroke="#fde68a"
        strokeWidth="1.2"
        strokeDasharray="3 3"
      />
    </>
  );
}

/** One ski from above, tip at the top, with toe and heel piece of the binding. 14x132. */
function Ski() {
  return (
    <g>
      <path
        d="M0.5 20 Q0 4 7 1 Q14 4 13.5 20 L12.5 66 L13 128 Q13 132 9 132 H5 Q1 132 1 128 L1.5 66 Z"
        fill="#2563eb"
      />
      <path d="M7 6 L7 46" stroke="#f97316" strokeWidth="3.5" />
      <path
        d="M3.5 104 L10.5 98 M3.5 114 L10.5 108 M3.5 124 L10.5 118"
        stroke="#bfdbfe"
        strokeWidth="1.8"
      />
      {/* binding: toe piece, heel piece with brake arms */}
      <rect x="2.5" y="56" width="9" height="11" rx="3" fill="#3f3f46" strokeWidth="1.6" />
      <path d="M7 67 V80" stroke="#a1a1aa" strokeWidth="2" />
      <rect x="2" y="80" width="10" height="15" rx="3" fill="#3f3f46" strokeWidth="1.6" />
      <rect x="4.5" y="83" width="5" height="4" rx="1" fill="#ef4444" stroke="none" />
      <path d="M2 93 l-5 3 M12 93 l5 3" strokeWidth="2" />
    </g>
  );
}

/** One ski pole from grip to tip: grip, strap, shaft, basket. */
function Pole({ from, to }: { from: [number, number]; to: [number, number] }) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const at = (t: number): [number, number] => [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI - 90;
  const [bx, by] = at(0.88);
  const [gx, gy] = at(0.1);
  return (
    <g>
      <path d={`M${x1} ${y1} L${x2} ${y2}`} stroke={INK} strokeWidth="3.6" />
      <path d={`M${x1} ${y1} L${x2} ${y2}`} stroke="#d4d4d8" strokeWidth="1.6" />
      <ellipse
        cx={bx}
        cy={by}
        rx="7.5"
        ry="2.6"
        transform={`rotate(${angle} ${bx} ${by})`}
        fill="#18181b"
      />
      <rect
        x={x1 - 3.5}
        y={y1}
        width="7"
        height="18"
        rx="3"
        fill="#18181b"
        transform={`rotate(${angle} ${x1} ${y1})`}
      />
      <path d={`M${gx - 2} ${gy - 8} q-9 6 -2 14`} stroke="#ef4444" strokeWidth="2" />
    </g>
  );
}

/** A pair of skis leaning in an A, the poles next to them. */
function Skis() {
  return (
    <>
      <g transform="translate(68 10) rotate(-7 7 132)">
        <Ski />
      </g>
      <g transform="translate(88 10) rotate(5 7 132)">
        <Ski />
      </g>
      <Pole from={[124, 14]} to={[138, 142]} />
      <Pole from={[138, 16]} to={[146, 142]} />
    </>
  );
}

/**
 * A ski boot, toe to the left: forward-leaning black cuff over the shell, buckles lying on
 * the front, power strap at the top and a sole with lips at toe and heel.
 */
function SkiBoots() {
  const buckle = (x: number, y: number, angle: number) => (
    <g transform={`rotate(${angle} ${x} ${y})`}>
      <path d={`M${x - 10} ${y + 2} h10`} stroke="#71717a" strokeWidth="2" />
      <rect x={x} y={y - 1} width="16" height="6" rx="2" fill="#d4d4d8" strokeWidth="1.6" />
    </g>
  );
  return (
    <>
      {/* liner and tongue */}
      <path d="M80 18 Q84 8 104 8 Q124 8 130 16 L128 26 L84 28 Z" fill="#a1a1aa" />
      {/* lower shell */}
      <path
        d="M150 86 L152 122 L42 122 Q38 122 38 116 Q38 106 52 102 L88 88 Q98 84 112 84 Z"
        fill="#f59e0b"
      />
      <path d="M58 112 H140" stroke="#fde68a" strokeWidth="2" />
      {/* cuff, leaning forward */}
      <path d="M78 24 L132 18 L150 78 Q152 92 140 96 L112 96 Q100 96 98 84 Z" fill="#18181b" />
      <circle cx="132" cy="80" r="3.5" fill="#d4d4d8" strokeWidth="1.4" />
      <rect
        x="78"
        y="24"
        width="56"
        height="8"
        rx="2"
        fill="#f59e0b"
        strokeWidth="1.6"
        transform="rotate(-6 106 28)"
      />
      {buckle(88, 46, -18)}
      {buckle(94, 66, -18)}
      {buckle(74, 92, -22)}
      {/* sole with lips */}
      <path d="M36 122 H156 V130 Q156 134 152 134 H40 Q36 134 36 130 Z" fill="#3f3f46" />
      <path d="M30 122 H42 M150 122 H162" strokeWidth="3.5" />
    </>
  );
}

/** A ski helmet from the side: shell down over the ears, ear pad, chin strap, goggles. */
function SkiHelmet() {
  return (
    <>
      <path
        d="M42 84 C42 46 76 24 114 24 C152 24 178 50 178 88 Q178 104 170 110 L150 112 Q146 128 132 130 L118 130 Q106 128 104 114 Q102 100 92 98 L56 98 Q42 98 42 84 Z"
        fill="#0f766e"
      />
      <path
        d="M150 112 Q146 128 132 130 L118 130 Q106 128 104 114"
        stroke="#134e4a"
        strokeWidth="5"
      />
      <path d="M96 32 l12 -2 M122 30 l12 2 M148 40 l9 7" stroke="#99f6e4" strokeWidth="3" />
      <circle cx="128" cy="112" r="9" fill="#1f2937" strokeWidth="1.8" />
      <path d="M124 110 h8 M124 114 h8" stroke="#6b7280" strokeWidth="1.4" />
      <path d="M120 130 Q114 140 100 142" strokeWidth="2.2" />
      <rect x="90" y="138" width="12" height="6" rx="2" fill="#18181b" strokeWidth="1.4" />
      {/* goggles on the front, strap around the shell */}
      <path d="M48 66 Q112 50 176 70" stroke="#18181b" strokeWidth="7" />
      <path
        d="M30 56 Q30 48 40 48 L82 50 Q90 50 90 58 L88 74 Q86 82 78 82 L42 80 Q32 80 31 72 Z"
        fill="#fb923c"
      />
      <path d="M38 56 Q58 53 80 57" stroke="#fed7aa" strokeWidth="2.5" />
    </>
  );
}

/** A children's bike with training wheel: proper frame, fork, chain guard. */
function KidsBike() {
  const wheel = (cx: number) => (
    <g>
      <circle cx={cx} cy="110" r="28" strokeWidth="5" />
      <circle cx={cx} cy="110" r="22" strokeWidth="1" opacity="0.4" />
      {[0, 45, 90, 135].map((a) => {
        const r = (a * Math.PI) / 180;
        return (
          <path
            key={a}
            d={`M${cx - Math.cos(r) * 22} ${110 - Math.sin(r) * 22} L${cx + Math.cos(r) * 22} ${110 + Math.sin(r) * 22}`}
            strokeWidth="0.9"
            opacity="0.45"
          />
        );
      })}
      <circle cx={cx} cy="110" r="3" fill={INK} stroke="none" />
    </g>
  );
  return (
    <>
      {wheel(54)}
      {wheel(146)}
      {/* training wheel on the rear axle */}
      <path d="M54 110 L42 126" strokeWidth="2.5" />
      <circle cx="40" cy="128" r="9" strokeWidth="2.5" fill="#e4e4e7" />
      <g stroke="#dc2626" strokeWidth="5">
        {/* chain and seat stays, seat tube, top tube, down tube, fork */}
        <path d="M54 110 L94 112 L84 66 L54 110" />
        <path d="M86 72 L128 64 L94 112" />
        <path d="M130 62 L146 110" />
      </g>
      <path d="M84 66 L82 54" strokeWidth="3" />
      <path d="M70 52 Q82 48 94 52 Q90 58 80 57 Q72 57 70 52 Z" fill="#18181b" />
      <path d="M128 64 L124 44 L110 42" strokeWidth="3" />
      <path d="M104 42 h10" stroke="#2563eb" strokeWidth="6" />
      <circle cx="94" cy="112" r="7" fill="#d4d4d8" strokeWidth="1.8" />
      <path
        d="M58 104 Q76 102 98 106 Q102 112 98 116 Q76 118 58 114 Z"
        fill="#fda4af"
        strokeWidth="1.8"
      />
    </>
  );
}

/** A road bike helmet from the side: long and flat, vents, visor, straps. */
function BikeHelmet() {
  return (
    <>
      <path
        d="M22 92 C24 66 60 46 106 44 C150 42 184 62 192 88 Q194 96 184 96 L56 104 Q26 108 22 92 Z"
        fill="#22c55e"
      />
      <path d="M26 86 Q20 80 10 82 L14 74 Q26 72 32 80 Z" fill="#15803d" />
      {[
        'M54 66 Q72 56 92 54 L92 64 Q74 66 60 74 Z',
        'M102 52 Q126 50 146 58 L140 68 Q122 62 102 62 Z',
        'M156 64 Q172 70 182 82 L168 84 Q162 76 150 72 Z',
        'M48 86 Q70 78 96 76 L96 86 Q74 88 54 94 Z',
        'M106 74 Q132 74 156 80 L152 90 Q130 86 106 84 Z',
      ].map((d) => (
        <path key={d} d={d} fill="#14532d" strokeWidth="1.6" />
      ))}
      <path d="M56 104 L184 96" stroke="#18181b" strokeWidth="4" />
      <path d="M92 102 L102 128 L124 99 M102 128 V136" strokeWidth="2" />
      <rect x="96" y="134" width="12" height="7" rx="2" fill="#18181b" strokeWidth="1.4" />
    </>
  );
}

const DRAWINGS: Record<Exclude<ItemDrawingId, 'cityBike'>, () => ReactNode> = {
  kidsClothes: KidsClothes,
  toyBricks: ToyBricks,
  rainBoots: RainBoots,
  jacket: Jacket,
  ankleBoots: AnkleBoots,
  handbag: Handbag,
  skis: Skis,
  skiBoots: SkiBoots,
  skiHelmet: SkiHelmet,
  kidsBike: KidsBike,
  bikeHelmet: BikeHelmet,
};

/** One item, drawn in the shared 200x150 box. */
export function ItemDrawing({ id, className }: { id: ItemDrawingId; className?: string }) {
  // The old city bike of the landing page story has its own, slightly wider box
  if (id === 'cityBike') return <BikeIllustration className={cn('text-zinc-800', className)} />;
  const Drawing = DRAWINGS[id];
  return (
    <Svg className={className}>
      <Drawing />
    </Svg>
  );
}

const BACKDROPS: Record<ItemKind, string> = {
  kids: 'from-amber-100 via-orange-50 to-rose-100',
  clothing: 'from-rose-100 via-stone-50 to-emerald-100',
  ski: 'from-sky-200 via-white to-slate-200',
  bike: 'from-sky-200 via-sky-100 to-stone-300',
};

/**
 * An item as a "photo" on the light backdrop of its kind: `item` picks one of the three
 * examples; without it the three are arranged like a group shot (cards, page headers).
 */
export function ItemPhoto({
  kind,
  item,
  className,
}: {
  kind: ItemKind;
  item?: 0 | 1 | 2;
  className?: string;
}) {
  const [main, second, third] = KIND_ITEMS[kind];
  return (
    <div
      className={cn(
        'relative flex items-center justify-center overflow-hidden bg-gradient-to-b',
        BACKDROPS[kind],
        className
      )}
    >
      {item !== undefined ? (
        <ItemDrawing id={KIND_ITEMS[kind][item]} className="h-[82%] max-h-full w-[82%]" />
      ) : (
        <div className="flex h-[96%] w-full items-end justify-center">
          <ItemDrawing id={second} className="-mr-[6%] h-[90%] w-[38%]" />
          <ItemDrawing id={main} className="z-10 h-full w-[42%]" />
          <ItemDrawing id={third} className="-ml-[6%] h-[88%] w-[38%]" />
        </div>
      )}
    </div>
  );
}
