import {
  SORT_COLORS,
  SORT_SHAPES,
  basketNumber,
  sortMark,
  sortMarkLayout,
  sortMarkText,
} from '../../shared/sortCode';
import { cn } from '../../lib/utils';

const rgb = (color: readonly [number, number, number]) => `rgb(${color.join(' ')})`;

const WIDTH = 183;
const HEIGHT = 110;

function Shape({
  digit,
  x,
  y,
  size,
  fill,
  outlined,
}: {
  digit: number;
  x: number;
  y: number;
  size: number;
  fill: string;
  outlined?: boolean;
}) {
  return (
    <polygon
      points={SORT_SHAPES[digit].points.map((point) => point.join()).join(' ')}
      transform={`translate(${x} ${y}) scale(${size / 100})`}
      fill={fill}
      stroke={outlined ? 'black' : undefined}
      strokeWidth={outlined ? 3 : undefined}
    />
  );
}

/** The sorting code as it is printed, on white like the paper. Set the size by its height. */
export function SortMarkBadge({ code, className }: { code: number; className?: string }) {
  const mark = sortMark(code);
  const layout = sortMarkLayout(mark, WIDTH, HEIGHT);
  const { fill, ink } = SORT_COLORS[mark.pile];
  const text = { fontFamily: 'Helvetica, Arial, sans-serif', fontWeight: 700 };
  return (
    <svg
      viewBox={`-4 -4 ${WIDTH + 8} ${HEIGHT + 8}`}
      role="img"
      aria-label={sortMarkText(code)}
      className={cn('inline-block h-8 w-auto shrink-0 rounded-sm bg-white', className)}
    >
      <rect width={layout.pile.width} height={HEIGHT} fill={rgb(fill)} />
      <Shape digit={mark.pile} {...layout.pile.shape} fill={rgb(ink)} />
      <text
        {...text}
        x={layout.pile.width / 2}
        y={HEIGHT * 0.95}
        fontSize={layout.pile.digitEm}
        textAnchor="middle"
        fill={rgb(ink)}
      >
        {mark.pile}
      </text>
      {layout.baskets.map((basket, i) => (
        <g key={i}>
          <Shape
            digit={mark.baskets[i] % 10}
            x={basket.shapeX}
            y={basket.y}
            size={basket.size}
            fill={rgb(SORT_COLORS[Math.floor(mark.baskets[i] / 10)].fill)}
            outlined
          />
          <text
            {...text}
            x={basket.numberX}
            y={basket.y + basket.size / 2 + basket.numberEm * 0.36}
            fontSize={basket.numberEm}
            textAnchor="middle"
            fill="black"
          >
            {basketNumber(mark.baskets[i])}
          </text>
        </g>
      ))}
      {layout.letter && (
        <text
          {...text}
          x={layout.letter.x}
          y={HEIGHT / 2 + layout.letter.em * 0.36}
          fontSize={layout.letter.em}
          textAnchor="middle"
          fill="black"
        >
          {mark.letter}
        </text>
      )}
    </svg>
  );
}
