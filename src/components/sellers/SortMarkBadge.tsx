import { sortMark, type SortSymbol } from '../../shared/sortCode';
import { cn } from '../../lib/utils';

const rgb = (color: readonly [number, number, number]) => `rgb(${color.join(' ')})`;

function Symbol({ symbol }: { symbol: SortSymbol }) {
  const ink = rgb(symbol.ink);
  return (
    <svg viewBox="-10 -10 20 20" className="h-[65%] w-full" aria-hidden="true">
      {symbol.id === 'circle' && <circle r="10" fill={ink} />}
      {symbol.id === 'triangle' && <path d="M0-10 10 10H-10Z" fill={ink} />}
      {symbol.id === 'square' && <rect x="-10" y="-10" width="20" height="20" fill={ink} />}
      {symbol.id === 'diamond' && <path d="M0-10 10 0 0 10-10 0Z" fill={ink} />}
      {symbol.id === 'cross' && <path d="M-3-10H3V-3H10V3H3V10H-3V3H-10V-3H-3Z" fill={ink} />}
      {symbol.id === 'bars' && (
        <path d="M-10-10H10V-5H-10ZM-10-2.5H10V2.5H-10ZM-10 5H10V10H-10Z" fill={ink} />
      )}
    </svg>
  );
}

function Field({ symbol, className }: { symbol: SortSymbol; className?: string }) {
  return (
    <span
      className={cn('flex items-center justify-center', className)}
      style={{ backgroundColor: rgb(symbol.fill) }}
    >
      <Symbol symbol={symbol} />
    </span>
  );
}

/** The sorting code as it is printed: large digit, one wide field over two small ones. */
export function SortMarkBadge({ code, className }: { code: number; className?: string }) {
  const { digit, fields, letter } = sortMark(code);
  return (
    <span className={cn('inline-flex h-8 w-16 shrink-0 items-stretch gap-1', className)}>
      <span className="flex flex-col items-center justify-center font-bold leading-none tabular-nums">
        <span className="text-[1.6em]">{digit}</span>
        {letter && <span className="text-[0.6em]">{letter}</span>}
      </span>
      <span className="grid min-w-0 flex-1 grid-cols-2 grid-rows-2 gap-px">
        <Field symbol={fields[0]} className="col-span-2" />
        <Field symbol={fields[1]} />
        <Field symbol={fields[2]} />
      </span>
    </span>
  );
}
