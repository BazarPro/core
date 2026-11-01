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
  | 'bikeLock';

/** The three example items of each kind, in the order of eventTypes.<id>.exampleItems. */
const KIND_ITEMS: Record<ItemKind, [ItemDrawingId, ItemDrawingId, ItemDrawingId]> = {
  kids: ['kidsClothes', 'toyBricks', 'rainBoots'],
  clothing: ['jacket', 'ankleBoots', 'handbag'],
  ski: ['skis', 'skiBoots', 'skiHelmet'],
  bike: ['cityBike', 'kidsBike', 'bikeLock'],
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

/** A striped children's T-shirt and denim dungarees with bib pocket and rolled-up legs. */
function KidsClothes() {
  return (
    <>
      {/* T-shirt: sloping shoulders, sleeves angled out and down, wide body */}
      <path
        d="M46 32 C50 42 66 42 70 32 L88 38 L108 60 L94 73 L86 63 L86 114 Q58 118 30 114 L30 63 L22 73 L8 60 L28 38 Z"
        fill="#fffbeb"
      />
      {[76, 88, 100].map((y) => (
        <path key={y} d={`M32 ${y} H84`} stroke="#2563eb" strokeWidth="5" strokeLinecap="butt" />
      ))}
      <path
        d="M12 56 L25 69 M104 56 L91 69"
        stroke="#2563eb"
        strokeWidth="3.5"
        strokeLinecap="butt"
      />
      <path d="M46 32 C50 42 66 42 70 32 L88 38 L108 60 L94 73 L86 63 L86 114 Q58 118 30 114 L30 63 L22 73 L8 60 L28 38 Z" />
      <path d="M42 33.5 C46 48 70 48 74 33.5" strokeWidth="1.8" />
      {/* dungarees */}
      <path d="M131 50 L124 22 M161 50 L168 22" stroke={INK} strokeWidth="8" />
      <path d="M131 50 L124 22 M161 50 L168 22" stroke="#60a5fa" strokeWidth="4.5" />
      <path
        d="M128 46 H164 V74 H172 Q177 76 177 82 L182 126 H156 L148 98 L140 126 H114 L119 82 Q119 76 124 74 H128 Z"
        fill="#3b82f6"
      />
      <rect x="137" y="53" width="18" height="14" rx="2" fill="#60a5fa" strokeWidth="1.8" />
      <circle cx="131" cy="50" r="2.8" fill="#fde047" strokeWidth="1.4" />
      <circle cx="161" cy="50" r="2.8" fill="#fde047" strokeWidth="1.4" />
      <path d="M121 76 H175" stroke="#1d4ed8" strokeWidth="2" />
      <path d="M148 80 V98" strokeWidth="1.6" opacity="0.6" />
      <path
        d="M116 116 L140 116 L139 126 L114 126 Z M156 116 L180 116 L182 126 L157 126 Z"
        fill="#93c5fd"
        strokeWidth="1.8"
      />
      <path
        d="M128 84 V112 M168 84 V112"
        stroke="#dbeafe"
        strokeWidth="1.2"
        strokeDasharray="2 3"
      />
    </>
  );
}

// Isometric projection for the building bricks: one stud is U wide
const U = 12;
const ISO_X = 0.866;
function iso(ox: number, oy: number, i: number, j: number, k: number): string {
  return `${ox + (i - j) * ISO_X * U},${oy + (i + j) * 0.5 * U - k}`;
}

/** One building brick in isometric view: top and two sides, studs as small cylinders. */
function IsoBrick({
  ox,
  oy,
  w,
  d,
  colors,
}: {
  ox: number;
  oy: number;
  w: number;
  d: number;
  colors: [top: string, left: string, right: string];
}) {
  const h = 11;
  const [top, left, right] = colors;
  const studs = [];
  for (let j = 0; j < d; j++) {
    for (let i = 0; i < w; i++) studs.push([i + 0.5, j + 0.5]);
  }
  studs.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  return (
    <g strokeWidth="1.6">
      <polygon
        points={[
          iso(ox, oy, 0, d, 0),
          iso(ox, oy, w, d, 0),
          iso(ox, oy, w, d, h),
          iso(ox, oy, 0, d, h),
        ].join(' ')}
        fill={left}
      />
      <polygon
        points={[
          iso(ox, oy, w, 0, 0),
          iso(ox, oy, w, d, 0),
          iso(ox, oy, w, d, h),
          iso(ox, oy, w, 0, h),
        ].join(' ')}
        fill={right}
      />
      <polygon
        points={[
          iso(ox, oy, 0, 0, h),
          iso(ox, oy, w, 0, h),
          iso(ox, oy, w, d, h),
          iso(ox, oy, 0, d, h),
        ].join(' ')}
        fill={top}
      />
      {studs.map(([i, j]) => {
        const [cx, cy] = iso(ox, oy, i, j, h).split(',').map(Number);
        const rx = 3.3;
        const ry = 1.9;
        return (
          <g key={`${i}-${j}`}>
            <path
              d={`M${cx - rx} ${cy} V${cy - 3} A${rx} ${ry} 0 0 1 ${cx + rx} ${cy - 3} V${cy} A${rx} ${ry} 0 0 1 ${cx - rx} ${cy} Z`}
              fill={left}
              strokeWidth="1.2"
            />
            <ellipse cx={cx} cy={cy - 3} rx={rx} ry={ry} fill={top} strokeWidth="1.2" />
          </g>
        );
      })}
    </g>
  );
}

const RED: [string, string, string] = ['#f87171', '#dc2626', '#b91c1c'];
const YELLOW: [string, string, string] = ['#fde047', '#eab308', '#ca8a04'];
const BLUE: [string, string, string] = ['#60a5fa', '#2563eb', '#1d4ed8'];
const GREEN: [string, string, string] = ['#4ade80', '#16a34a', '#15803d'];

/** Building bricks: a stack of three and two loose ones, back to front. */
function ToyBricks() {
  return (
    <>
      <IsoBrick ox={108} oy={42} w={2} d={2} colors={GREEN} />
      <IsoBrick ox={82} oy={52} w={4} d={2} colors={RED} />
      <IsoBrick ox={88} oy={41} w={2} d={2} colors={YELLOW} />
      <IsoBrick ox={96} oy={30} w={2} d={1} colors={BLUE} />
      <IsoBrick ox={42} oy={92} w={2} d={1} colors={BLUE} />
      <IsoBrick ox={140} oy={90} w={3} d={1} colors={YELLOW} />
    </>
  );
}

/** One children's rubber boot, toe to the left: shaft, rounded toe, thin sole on the foot. */
function RubberBoot({ x, y }: { x: number; y: number }) {
  const fill = '#ef4444';
  const shade = '#b91c1c';
  return (
    <g transform={`translate(${x} ${y})`}>
      <path
        d="M26 6 L72 6 L74 58 Q76 74 74 90 L8 90 Q0 90 1 81 Q3 69 15 65 Q26 61 27 48 Z"
        fill={fill}
      />
      <path d="M26 6 L72 6 L72.4 15 L26.6 15 Z" fill={shade} strokeWidth="2" />
      {[
        [40, 28],
        [58, 38],
        [42, 50],
        [60, 62],
        [22, 76],
        [44, 76],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.6" fill="#ffffff" stroke="none" />
      ))}
      <path
        d="M1 86 Q0 90 4 92 L34 92 L40 90 L52 90 L54 92 L74 92 Q76 92 75 88 L74 90 L8 90 Q2 90 1 86 Z"
        fill="#3f3f46"
        strokeWidth="2"
      />
    </g>
  );
}

/** A pair of children's rubber boots with white dots. */
function RainBoots() {
  return (
    <>
      <RubberBoot x={96} y={24} />
      <RubberBoot x={36} y={36} />
    </>
  );
}

/** A zipped jacket laid flat: stand-up collar, sleeves with cuffs, pockets. */
function Jacket() {
  return (
    <>
      {/* sleeves */}
      <path d="M64 34 L46 46 L38 112 Q44 116 52 114 L60 68 Z" fill="#be123c" />
      <path d="M136 34 L154 46 L162 112 Q156 116 148 114 L140 68 Z" fill="#be123c" />
      <path
        d="M38.5 112 L39.6 103 Q45 106 53.5 105 L52 114 Q44 116 38.5 112 Z"
        fill="#881337"
        strokeWidth="1.8"
      />
      <path
        d="M161.5 112 L160.4 103 Q155 106 146.5 105 L148 114 Q156 116 161.5 112 Z"
        fill="#881337"
        strokeWidth="1.8"
      />
      {/* body */}
      <path d="M64 34 L84 26 L100 34 L116 26 L136 34 L142 128 L58 128 Z" fill="#e11d48" />
      {/* collar */}
      <path d="M84 26 Q84 16 100 16 Q116 16 116 26 L100 36 Z" fill="#881337" />
      <path d="M100 36 V128" stroke="#fde68a" strokeWidth="2" />
      <rect x="97" y="42" width="6" height="8" rx="1.5" fill="#fde68a" strokeWidth="1.4" />
      <path d="M70 90 L88 88 M112 88 L130 90" strokeWidth="2.2" />
      <path d="M58.5 120 H141.5" stroke="#881337" strokeWidth="2" />
    </>
  );
}

/**
 * One women's ankle boot, toe to the left, in a 90x90 box: the foot slopes down from the
 * heel to the toe, zip on the side, thin sole along the foot and a block heel.
 */
function AnkleBoot({ x, y }: { x: number; y: number }) {
  const fill = '#b45309';
  const shade = '#78350f';
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* block heel */}
      <path d="M68 66 L87 64 L85 91 L73 91 Z" fill="#292524" />
      {/* upper */}
      <path
        d="M42 4 Q62 1 82 4 Q82 32 86 54 Q88 62 87 65 L68 67 Q54 72 42 87 L10 89 Q0 89 1 80 Q4 71 18 66 Q32 60 37 44 Q41 26 42 4 Z"
        fill={fill}
      />
      {/* zip */}
      <path d="M62 8 V46" stroke={shade} strokeWidth="2.4" />
      <path d="M62 8 V46" stroke="#fde68a" strokeWidth="1" strokeDasharray="1.5 1.5" />
      <rect x="60" y="6" width="4" height="6" rx="1" fill="#fde68a" strokeWidth="1" />
      {/* thin sole */}
      <path d="M68 67 Q54 72 42 87 L10 89 Q1 89 1 83" stroke="#292524" strokeWidth="4" />
    </g>
  );
}

/** A pair of women's ankle boots. */
function AnkleBoots() {
  return (
    <>
      <AnkleBoot x={92} y={26} />
      <AnkleBoot x={14} y={40} />
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

/** A U-lock: thin coated steel shackle, thick crossbar with lock cylinder, keys on a ring. */
function BikeLock() {
  return (
    <>
      <path
        d="M78 100 V46 A22 22 0 0 1 122 46 V100"
        stroke={INK}
        strokeWidth="11"
        strokeLinecap="butt"
      />
      <path
        d="M78 100 V46 A22 22 0 0 1 122 46 V100"
        stroke="#52525b"
        strokeWidth="6.5"
        strokeLinecap="butt"
      />
      <path d="M76.5 62 V46 A23 23 0 0 1 88 27" stroke="#a1a1aa" strokeWidth="1.8" />
      <rect x="46" y="94" width="108" height="24" rx="12" fill="#2563eb" />
      <path d="M58 101 H142" stroke="#93c5fd" strokeWidth="2.5" />
      <circle cx="100" cy="106" r="7" fill="#d4d4d8" strokeWidth="1.8" />
      <path d="M100 103 V109" strokeWidth="2.2" />
      {/* keys */}
      <circle cx="100" cy="124" r="4" strokeWidth="2" />
      <path
        d="M103 127 L119 137 M114 134 L112 138 M118 136 L116 140"
        stroke="#71717a"
        strokeWidth="2.6"
      />
      <circle cx="107" cy="131" r="3" fill="#fbbf24" strokeWidth="1.4" />
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
  bikeLock: BikeLock,
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
          <ItemDrawing id={second} className="-mr-[4%] h-[88%] w-[35%]" />
          <ItemDrawing id={main} className="z-10 h-full w-[42%]" />
          <ItemDrawing id={third} className="-ml-[4%] h-[86%] w-[35%]" />
        </div>
      )}
    </div>
  );
}
