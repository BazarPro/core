/* eslint-disable react-refresh/only-export-components -- a page of its own, not hot-reloaded */
import type { CSSProperties, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ItemDrawing,
  type ItemDrawingId,
} from '../../src/components/illustrations/ItemIllustrations';

/*
 * Source of the cover templates in public/images/covers (see render.mjs): scenes of 1600x900
 * made of the wizard's item drawings. The hero crops them to 21:9 and puts the title over
 * the lower edge, so what matters stays between y 110 and 620 and x 80 and 1520.
 */

function Item({
  id,
  x,
  y,
  w,
  rotate = 0,
  filter,
}: {
  id: ItemDrawingId;
  x: number;
  y: number;
  w: number;
  rotate?: number;
  filter?: string;
}) {
  const style: CSSProperties = {
    position: 'absolute',
    left: x,
    top: y,
    width: w,
    height: w * 0.75,
    transform: rotate ? `rotate(${rotate}deg)` : undefined,
    filter,
  };
  return (
    <div style={style}>
      <ItemDrawing id={id} />
    </div>
  );
}

function Backdrop({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 1600 900" style={{ position: 'absolute', inset: 0 }} aria-hidden>
      {children}
    </svg>
  );
}

const FLAGS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'];

/** A string of little flags sagging between two points. */
function Bunting({ y, sag = 60, count = 17 }: { y: number; sag?: number; count?: number }) {
  const at = (t: number) => ({ x: t * 1600, y: y + 4 * sag * t * (1 - t) });
  return (
    <>
      <path
        d={`M0 ${y} Q800 ${y + 2 * sag} 1600 ${y}`}
        stroke="#57534e"
        strokeWidth="4"
        fill="none"
      />
      {Array.from({ length: count }, (_, i) => {
        const a = at((i + 0.1) / count);
        const b = at((i + 0.9) / count);
        return (
          <path
            key={i}
            d={`M${a.x} ${a.y} L${b.x} ${b.y} L${(a.x + b.x) / 2} ${(a.y + b.y) / 2 + 62} Z`}
            fill={FLAGS[i % FLAGS.length]}
          />
        );
      })}
    </>
  );
}

function KidsRoom() {
  return (
    <>
      <Backdrop>
        <defs>
          <linearGradient id="KidsRoom" x2="0" y2="1">
            <stop stopColor="#fff7d6" />
            <stop offset="1" stopColor="#fde9c0" />
          </linearGradient>
        </defs>
        <rect width="1600" height="900" fill="url(#KidsRoom)" />
        {Array.from({ length: 16 }, (_, i) => (
          <rect key={i} x={i * 100} width="50" height="620" fill="#fff" opacity="0.28" />
        ))}
        <rect y="620" width="1600" height="280" fill="#d9a066" />
        <rect y="612" width="1600" height="14" fill="#fff" />
        {[0, 1, 2, 3].map((row) =>
          Array.from({ length: 9 }, (_, i) => (
            <rect
              key={`${row}-${i}`}
              x={(row % 2 ? -100 : 0) + i * 200}
              y={626 + row * 70}
              width="200"
              height="70"
              fill="none"
              stroke="#b98149"
              strokeWidth="3"
            />
          ))
        )}
        <ellipse cx="800" cy="668" rx="640" ry="62" fill="#fb7185" opacity="0.55" />
        <ellipse cx="800" cy="668" rx="540" ry="46" fill="#fda4af" opacity="0.7" />
        <Bunting y={18} />
        {[
          [120, 300, '#f87171'],
          [1490, 270, '#60a5fa'],
          [1400, 350, '#facc15'],
        ].map(([cx, cy, fill]) => (
          <g key={String(fill)}>
            <path
              d={`M${cx} ${Number(cy) + 66} q-18 90 6 180`}
              stroke="#78716c"
              strokeWidth="3"
              fill="none"
            />
            <ellipse cx={cx} cy={cy} rx="52" ry="66" fill={String(fill)} />
            <ellipse
              cx={Number(cx) - 18}
              cy={Number(cy) - 24}
              rx="11"
              ry="17"
              fill="#fff"
              opacity="0.55"
            />
          </g>
        ))}
      </Backdrop>
      <Item id="toyBricks" x={140} y={400} w={380} />
      <Item id="kidsClothes" x={480} y={190} w={640} />
      <Item id="rainBoots" x={1080} y={395} w={380} />
    </>
  );
}

function ClothesRail() {
  const hangers = [200, 480, 760, 1040];
  const tints = [
    'none',
    'hue-rotate(140deg)',
    'hue-rotate(250deg) saturate(0.9)',
    'hue-rotate(60deg)',
  ];
  return (
    <>
      <Backdrop>
        <defs>
          <linearGradient id="ClothesRail" x2="1" y2="1">
            <stop stopColor="#fdf2f8" />
            <stop offset="1" stopColor="#ecfdf5" />
          </linearGradient>
        </defs>
        <rect width="1600" height="900" fill="url(#ClothesRail)" />
        <rect y="690" width="1600" height="210" fill="#e7e0d6" />
        <rect y="682" width="1600" height="10" fill="#fff" />
        <path
          d="M150 110 H1450 M170 110 V735 M1430 110 V735"
          stroke="#52525b"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d="M110 738 H230 M1370 738 H1490"
          stroke="#52525b"
          strokeWidth="16"
          strokeLinecap="round"
        />
        {hangers.map((x) => (
          <path
            key={x}
            d={`M${x + 180} 110 q18 -22 0 -32 q-14 -6 -18 8 M${x + 180} 110 V152`}
            stroke="#71717a"
            strokeWidth="6"
            fill="none"
            strokeLinecap="round"
          />
        ))}
      </Backdrop>
      {hangers.map((x, i) => (
        <Item key={x} id="jacket" x={x - 30} y={118} w={420} filter={tints[i]} />
      ))}
      <Item id="handbag" x={1120} y={470} w={330} />
      <Item id="ankleBoots" x={210} y={500} w={330} />
    </>
  );
}

function SkiSlope() {
  const fir = (x: number, y: number, scale: number) => (
    <g key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect x="-9" y="0" width="18" height="34" fill="#78350f" />
      <path d="M0 -150 L52 -60 H26 L66 0 H-66 L-26 -60 H-52 Z" fill="#15803d" />
      <path d="M0 -150 L22 -112 Q0 -98 -22 -112 Z" fill="#fff" />
    </g>
  );
  return (
    <>
      <Backdrop>
        <defs>
          <linearGradient id="SkiSlope" x2="0" y2="1">
            <stop stopColor="#38bdf8" />
            <stop offset="1" stopColor="#e0f2fe" />
          </linearGradient>
        </defs>
        <rect width="1600" height="900" fill="url(#SkiSlope)" />
        <circle cx="1310" cy="140" r="70" fill="#fde68a" />
        <path
          d="M0 520 L260 220 L440 400 L660 130 L900 420 L1120 200 L1360 430 L1600 280 V900 H0 Z"
          fill="#94a3b8"
        />
        <path
          d="M260 220 L330 300 L280 285 L235 320 L195 295 Z M660 130 L745 232 L690 210 L640 250 L585 220 Z M1120 200 L1195 285 L1140 268 L1095 300 L1050 275 Z"
          fill="#fff"
        />
        <path d="M0 560 Q400 440 800 540 T1600 500 V900 H0 Z" fill="#f1f5f9" />
        {fir(120, 540, 1.1)}
        {fir(230, 530, 0.8)}
        {fir(1480, 520, 1.15)}
        {fir(1370, 525, 0.75)}
        <path d="M0 640 Q500 570 900 640 T1600 610 V900 H0 Z" fill="#fff" />
      </Backdrop>
      <Item id="skiHelmet" x={150} y={340} w={340} />
      <Item id="skis" x={450} y={110} w={700} />
      <Item id="skiBoots" x={1090} y={330} w={370} />
    </>
  );
}

function BikeStreet() {
  const houses: [number, number, string][] = [
    [0, 300, '#fca5a5'],
    [210, 210, '#fde68a'],
    [430, 280, '#a7f3d0'],
    [640, 190, '#bfdbfe'],
    [860, 260, '#fecaca'],
    [1080, 200, '#ddd6fe'],
    [1300, 290, '#fed7aa'],
  ];
  return (
    <>
      <Backdrop>
        <defs>
          <linearGradient id="BikeStreet" x2="0" y2="1">
            <stop stopColor="#7dd3fc" />
            <stop offset="1" stopColor="#fef9c3" />
          </linearGradient>
        </defs>
        <rect width="1600" height="900" fill="url(#BikeStreet)" />
        {houses.map(([x, top, fill]) => (
          <g key={x}>
            <path
              d={`M${x + 4} ${top} L${x + 110} ${top - 90} L${x + 216} ${top} Z`}
              fill="#b45309"
            />
            <rect x={x + 4} y={top} width="212" height={640 - top} fill={fill} />
            {[0, 1, 2].map((row) =>
              [0, 1].map((col) => (
                <rect
                  key={`${row}-${col}`}
                  x={x + 38 + col * 88}
                  y={top + 28 + row * 92}
                  width="52"
                  height="66"
                  rx="4"
                  fill="#fff"
                  stroke="#78716c"
                  strokeWidth="4"
                />
              ))
            )}
          </g>
        ))}
        <rect y="640" width="1600" height="50" fill="#d6d3d1" />
        <rect y="688" width="1600" height="212" fill="#a8a29e" />
        {[0, 1, 2].map((row) =>
          Array.from({ length: 17 }, (_, i) => (
            <rect
              key={`${row}-${i}`}
              x={(row % 2 ? -50 : 0) + i * 100}
              y={694 + row * 54}
              width="94"
              height="48"
              rx="10"
              fill="#b8b2ad"
            />
          ))
        )}
      </Backdrop>
      <Item id="cityBike" x={150} y={190} w={720} />
      <Item id="kidsBike" x={880} y={300} w={460} />
      <Item id="bikeLock" x={1320} y={500} w={230} />
    </>
  );
}

function MarketStalls() {
  const stalls: [number, string][] = [
    [40, '#ef4444'],
    [560, '#2563eb'],
    [1080, '#16a34a'],
  ];
  return (
    <>
      <Backdrop>
        <defs>
          <linearGradient id="MarketStalls" x2="0" y2="1">
            <stop stopColor="#bae6fd" />
            <stop offset="1" stopColor="#fef3c7" />
          </linearGradient>
        </defs>
        <rect width="1600" height="900" fill="url(#MarketStalls)" />
        <rect y="680" width="1600" height="220" fill="#d6d3d1" />
        {stalls.map(([x, color]) => (
          <g key={x}>
            <path
              d={`M${x + 24} 200 V690 M${x + 456} 200 V690`}
              stroke="#57534e"
              strokeWidth="12"
            />
            {Array.from({ length: 8 }, (_, i) => (
              <g key={i}>
                <path
                  d={`M${x + 34 + i * 54} 80 h54 L${x + i * 60 + 60} 190 h-60 Z`}
                  fill={i % 2 ? '#fff' : color}
                />
                <path
                  d={`M${x + i * 60} 190 h60 a30 26 0 0 1 -60 0 Z`}
                  fill={i % 2 ? '#fff' : color}
                  stroke="#00000022"
                />
              </g>
            ))}
            <rect x={x - 6} y="540" width="492" height="24" rx="4" fill="#92400e" />
            <rect x={x} y="564" width="480" height="130" fill={color} opacity="0.2" />
          </g>
        ))}
      </Backdrop>
      <Item id="jacket" x={60} y={250} w={220} />
      <Item id="toyBricks" x={280} y={400} w={200} />
      <Item id="kidsClothes" x={570} y={330} w={300} />
      <Item id="rainBoots" x={840} y={415} w={190} />
      <Item id="handbag" x={1100} y={345} w={270} />
      <Item id="ankleBoots" x={1340} y={425} w={190} />
    </>
  );
}

function Pattern() {
  const ids: ItemDrawingId[] = [
    'jacket',
    'toyBricks',
    'skiHelmet',
    'handbag',
    'kidsClothes',
    'bikeLock',
    'ankleBoots',
    'skiBoots',
    'rainBoots',
    'kidsBike',
    'cityBike',
    'skis',
  ];
  const tiles = ['#fef3c7', '#dbeafe', '#fce7f3', '#dcfce7'];
  return (
    <>
      {Array.from({ length: 24 }, (_, i) => {
        const col = i % 6;
        const row = Math.floor(i / 6);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: col * 267,
              top: row * 225,
              width: 267,
              height: 225,
              background: tiles[(col + row * 3) % 4],
            }}
          >
            <div style={{ position: 'absolute', inset: 26 }}>
              <ItemDrawing id={ids[i % ids.length]} />
            </div>
          </div>
        );
      })}
    </>
  );
}

const SCENES: Record<string, () => ReactNode> = {
  kids: KidsRoom,
  clothing: ClothesRail,
  ski: SkiSlope,
  bike: BikeStreet,
  market: MarketStalls,
  pattern: Pattern,
};

function Scenes() {
  return (
    <>
      {Object.entries(SCENES).map(([id, Scene]) => (
        <div key={id} className="cover" data-cover={id}>
          <Scene />
        </div>
      ))}
    </>
  );
}

createRoot(document.getElementById('root')!).render(<Scenes />);
