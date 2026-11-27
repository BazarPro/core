import { useMemo, type CSSProperties, type ReactNode } from 'react';
import type { LabelFormat } from '../../shared/constants';
import { MM_PER_PT, planLabel, type LabelText, type MeasureText } from '../../lib/labelLayout';
import { qrRuns, screenQr } from '../../lib/qrCode';
import { cn } from '../../lib/utils';
import { SortMarkBadge } from '../sellers/SortMarkBadge';

const FONT_FAMILY = 'Helvetica, Arial, sans-serif';

let context: CanvasRenderingContext2D | null | undefined;

/** Text widths as the PDF measures them, from the browser's Helvetica (or Arial). */
const measure: MeasureText = (text, pt, bold) => {
  if (context === undefined) {
    try {
      context = document.createElement('canvas').getContext('2d');
    } catch {
      context = null;
    }
  }
  const em = pt * MM_PER_PT;
  if (!context) return text.length * em * (bold ? 0.58 : 0.53);
  // At 100 px for precision, then scaled to the font size in mm
  context.font = `${bold ? 'bold ' : ''}100px ${FONT_FAMILY}`;
  return (context.measureText(text).width / 100) * em;
};

const ANCHOR = { left: 'start', center: 'middle', right: 'end' } as const;

/**
 * A label exactly as the PDF prints it (src/lib/labelLayout.ts): QR code, sorting mark,
 * title, size and price, in its real proportions. White in every theme like the paper;
 * the size follows the width.
 */
export function PrintedLabel({
  label,
  format,
  qrValue = 'https://bazarpro.de',
  className,
  style,
  overlay,
}: {
  label: LabelText;
  format: LabelFormat;
  qrValue?: string;
  className?: string;
  style?: CSSProperties;
  /** Over the QR code, e.g. a scan line */
  overlay?: ReactNode;
}) {
  const plan = useMemo(() => planLabel(label, format, measure), [label, format]);
  const qr = useMemo(() => {
    const { runs, total } = qrRuns(screenQr(qrValue));
    return {
      total,
      path: runs.map(({ x, y, width }) => `M${x} ${y}h${width}v1h-${width}Z`).join(''),
    };
  }, [qrValue]);
  const { width, height } = plan;
  return (
    <div
      className={cn('relative bg-white text-black', className)}
      style={{ aspectRatio: `${width} / ${height}`, ...style }}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={[label.title, label.size, label.price].filter(Boolean).join(', ')}
        className="block size-full"
      >
        <svg
          x={plan.qr.x}
          y={plan.qr.y}
          width={plan.qr.size}
          height={plan.qr.size}
          viewBox={`0 0 ${qr.total} ${qr.total}`}
          shapeRendering="crispEdges"
        >
          <path d={qr.path} fill="black" />
        </svg>
        {label.sortCode !== undefined && plan.mark && (
          <SortMarkBadge code={label.sortCode} place={plan.mark} />
        )}
        {plan.texts.map((text, index) => (
          <text
            key={index}
            x={text.x}
            y={text.y}
            fontFamily={FONT_FAMILY}
            fontWeight={text.bold ? 700 : 400}
            fontSize={text.pt * MM_PER_PT}
            textAnchor={ANCHOR[text.align]}
            fill="black"
          >
            {text.text}
          </text>
        ))}
      </svg>
      {overlay && (
        <div
          className="pointer-events-none absolute overflow-hidden"
          style={{
            left: `${(plan.qr.x / width) * 100}%`,
            top: `${(plan.qr.y / height) * 100}%`,
            width: `${(plan.qr.size / width) * 100}%`,
            height: `${(plan.qr.size / height) * 100}%`,
          }}
        >
          {overlay}
        </div>
      )}
    </div>
  );
}
