import {
  SORT_COLORS,
  sortMark,
  sortMarkLayout,
  sortMarkText,
  sortNumber,
} from '../../shared/sortCode';
import { cn } from '../../lib/utils';

const rgb = (color: readonly [number, number, number]) => `rgb(${color.join(' ')})`;

const WIDTH = 183;
const HEIGHT = 110;

const FONT = { fontFamily: 'Helvetica, Arial, sans-serif', fontWeight: 700 };

function Text({
  value,
  at,
  fill,
}: {
  value: string;
  at: { x: number; y: number; em: number };
  fill: string;
}) {
  return (
    <text {...FONT} x={at.x} y={at.y} fontSize={at.em} textAnchor="middle" fill={fill}>
      {value}
    </text>
  );
}

/** The sorting code as it is printed, on white like the paper. Set the size by its height. */
export function SortMarkBadge({ code, className }: { code: number; className?: string }) {
  const mark = sortMark(code);
  const { frame, radius, tile, fields } = sortMarkLayout(mark, WIDTH, HEIGHT);
  const fill = rgb(SORT_COLORS[mark.pile].fill);
  const ink = rgb(SORT_COLORS[mark.pile].ink);
  const values = [
    { value: mark.pair, color: SORT_COLORS[mark.pairColor] },
    { value: sortNumber(mark.number), color: SORT_COLORS[mark.numberColor] },
  ];
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={sortMarkText(code)}
      className={cn('inline-block h-8 w-auto shrink-0', className)}
    >
      <rect
        x={frame / 2}
        y={frame / 2}
        width={WIDTH - frame}
        height={HEIGHT - frame}
        rx={radius}
        fill="white"
        stroke="black"
        strokeWidth={frame}
      />
      <rect
        x={tile.x}
        y={tile.y}
        width={tile.width}
        height={tile.height}
        rx={tile.radius}
        fill={fill}
      />
      <Text value={String(mark.pile)} at={tile.digit} fill={ink} />
      <Text value={mark.letter} at={tile.letter} fill={ink} />
      {tile.extra && (
        <>
          <rect
            x={tile.extra.x}
            y={tile.extra.y}
            width={tile.extra.width}
            height={tile.extra.height}
            rx={tile.extra.radius}
            fill={ink}
          />
          <Text value={mark.extra} at={tile.extra.text} fill={fill} />
        </>
      )}
      {fields.map((field, i) => (
        <g key={i}>
          <rect
            x={field.x}
            y={field.y}
            width={field.width}
            height={field.height}
            rx={field.radius}
            fill={rgb(values[i].color.fill)}
          />
          <Text value={values[i].value} at={field.text} fill={rgb(values[i].color.ink)} />
        </g>
      ))}
    </svg>
  );
}
