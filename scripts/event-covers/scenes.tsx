/* eslint-disable react-refresh/only-export-components -- a page of its own, not hot-reloaded */
import type { CSSProperties, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ItemDrawing,
  type ItemDrawingId,
} from '../../src/components/illustrations/ItemIllustrations';

/*
 * Source of the drawn cover templates in public/images/covers (see render.mjs; the others are
 * photos, see src/lib/eventCovers.ts): scenes of 1600x900
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
  ski: SkiSlope,
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
