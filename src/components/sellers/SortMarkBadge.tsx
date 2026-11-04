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
  const { pile } = layout;
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={sortMarkText(code)}
      className={cn('inline-block h-8 w-auto shrink-0', className)}
    >
      <rect
        x={layout.frame / 2}
        y={layout.frame / 2}
        width={WIDTH - layout.frame}
        height={HEIGHT - layout.frame}
        rx={layout.radius}
        fill="white"
        stroke="black"
        strokeWidth={layout.frame}
      />
      <rect
        x={pile.x}
        y={pile.y}
        width={pile.width}
        height={pile.height}
        rx={pile.radius}
        fill={rgb(fill)}
      />
      <Shape digit={mark.pile} {...pile.shape} fill={rgb(ink)} />
      <text
        {...text}
        x={pile.digit.x}
        y={pile.digit.y}
        fontSize={pile.digit.em}
        textAnchor="middle"
        fill={rgb(ink)}
      >
        {mark.pile}
      </text>
      {layout.letters.map(({ char, x, y, em }, i) => (
        <text key={i} {...text} x={x} y={y} fontSize={em} textAnchor="middle" fill={rgb(ink)}>
          {char}
        </text>
      ))}
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
            x={basket.number.x}
            y={basket.number.y}
            fontSize={basket.number.em}
            textAnchor="middle"
            fill="black"
          >
            {basketNumber(mark.baskets[i])}
          </text>
        </g>
      ))}
    </svg>
  );
}
