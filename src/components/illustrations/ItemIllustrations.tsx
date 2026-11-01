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

/** A striped children's T-shirt and denim dungarees with bib pocket and rolled-up legs. */
function KidsClothes() {
  return (
    <>
      {/* T-shirt */}
      <path
        d="M44 32 L22 44 L30 63 L41 58 L41 120 Q62 124 83 120 L83 58 L94 63 L102 44 L80 32 Q62 46 44 32 Z"
        fill="#fffbeb"
      />
      {[72, 86, 100, 114].map((y) => (
        <path key={y} d={`M43 ${y} H81`} stroke="#2563eb" strokeWidth="5" />
      ))}
      <path d="M26 53 L34 49 M98 53 L90 49" stroke="#2563eb" strokeWidth="4" />
      <path d="M44 32 L22 44 L30 63 L41 58 L41 120 Q62 124 83 120 L83 58 L94 63 L102 44 L80 32" />
      <path d="M44 32 Q62 46 80 32 M48 33 Q62 42 76 33" />
      <path d="M41 58 V66 M83 58 V66" strokeWidth="1.6" opacity="0.5" />
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

/** One children's rubber boot, toe to the left, in a 90x110 box: rim, dots, ribbed sole. */
function RubberBoot({ x, y, fill, shade }: { x: number; y: number; fill: string; shade: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M78 12 Q90 12 90 24 Q90 32 82 32" fill={fill} strokeWidth="2.2" />
      <path
        d="M34 10 L80 10 L82 84 Q82 92 78 94 L10 94 Q2 94 2 84 Q2 72 16 68 L30 64 Q34 62 34 54 Z"
        fill={fill}
      />
      <path d="M32 4 H82 V16 H32 Z" fill={shade} />
      {[
        [48, 30],
        [66, 42],
        [50, 56],
        [68, 70],
        [24, 80],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4.5" fill="#ffffff" strokeWidth="1.4" />
      ))}
      <path d="M4 86 Q30 88 80 86" stroke={shade} strokeWidth="2" />
      <path d="M0 94 H84 V102 Q84 106 80 106 H4 Q0 106 0 102 Z" fill="#3f3f46" />
      <path
        d="M8 106 v-4 M18 106 v-4 M28 106 v-4 M38 106 v-4 M48 106 v-4 M58 106 v-4 M68 106 v-4 M78 106 v-4"
        stroke="#a1a1aa"
        strokeWidth="1.6"
      />
    </g>
  );
}

/** A pair of children's rubber boots with white dots. */
function RainBoots() {
  return (
    <>
      <RubberBoot x={92} y={14} fill="#f87171" shade="#b91c1c" />
      <RubberBoot x={46} y={30} fill="#ef4444" shade="#991b1b" />
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

/**
 * One Chelsea boot, toe to the left, in a 100x80 box: low shaft, long sleek toe sloping down
 * from the instep, tall U of elastic on the side, pull tab, thin welted sole, low heel.
 */
function ChelseaBoot({ x, y, fill, shade }: { x: number; y: number; fill: string; shade: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M86 14 V5 Q86 1 90 1 H92 Q95 1 95 5 L94 14" fill={shade} strokeWidth="2" />
      <path
        d="M54 14 Q74 11 94 14 Q95 40 97 60 Q99 66 99 72 L6 72 Q-2 72 0 67 Q2 63 14 60 Q30 55 38 46 Q48 34 52 22 Z"
        fill={fill}
      />
      <path d="M59 16 Q61 38 71 44 Q82 38 84 16 Z" fill={shade} strokeWidth="1.8" />
      <path
        d="M65 18 Q66 34 69 40 M71 17 V42 M78 18 Q77 34 73 40"
        stroke={fill}
        strokeWidth="1"
        opacity="0.7"
      />
      <path d="M6 65 Q24 58 38 50" stroke={shade} strokeWidth="1.4" strokeDasharray="2 2.5" />
      <path d="M-1 72 H100 V77 H-1 Z" fill="#c08a52" strokeWidth="1.8" />
      <path d="M78 77 H100 V83 H80 Z" fill="#292524" />
    </g>
  );
}

/** A pair of leather Chelsea boots, the second one behind. */
function AnkleBoots() {
  return (
    <>
      <ChelseaBoot x={88} y={30} fill="#a16207" shade="#422006" />
      <ChelseaBoot x={10} y={54} fill="#7c2d12" shade="#1c0a03" />
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

/**
 * A bike helmet from the side, front to the left: high rounded shell sloping back to a
 * short tail, rows of teardrop vents, visor at the forehead, black rim, retention dial and
 * straps with buckle below.
 */
function BikeHelmet() {
  return (
    <>
      <path d="M72 104 L98 134 M146 98 L104 134" strokeWidth="2.4" />
      <path
        d="M34 98 C28 70 42 40 80 28 C112 18 152 24 172 44 C186 58 192 74 188 88 Q186 94 178 94 L60 106 Q38 108 34 98 Z"
        fill="#22c55e"
      />
      {[
        'M70 50 Q84 34 108 30 Q100 42 80 58 Z',
        'M116 30 Q140 30 158 42 Q140 44 120 44 Z',
        'M164 52 Q176 62 182 76 Q170 70 160 62 Z',
        'M52 76 Q62 60 82 54 Q78 66 60 82 Z',
        'M92 58 Q118 50 146 56 Q122 64 96 70 Z',
        'M152 64 Q166 70 174 82 Q160 80 148 74 Z',
      ].map((d) => (
        <path key={d} d={d} fill="#14532d" strokeWidth="1.6" />
      ))}
      <path d="M38 98 Q110 90 184 92" stroke="#18181b" strokeWidth="5" />
      <path d="M40 76 Q22 74 10 82 L12 92 Q24 88 38 90 Z" fill="#18181b" />
      <circle cx="174" cy="101" r="5" fill="#3f3f46" strokeWidth="1.6" />
      <rect x="94" y="131" width="14" height="8" rx="2" fill="#18181b" strokeWidth="1.4" />
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
          <ItemDrawing id={second} className="-mr-[4%] h-[88%] w-[35%]" />
          <ItemDrawing id={main} className="z-10 h-full w-[42%]" />
          <ItemDrawing id={third} className="-ml-[4%] h-[86%] w-[35%]" />
        </div>
      )}
    </div>
  );
}
