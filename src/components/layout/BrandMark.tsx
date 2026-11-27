import { cn } from '../../lib/utils';

/**
 * The BazarPro mark: a price tag with a punched-out "B" and its string through the hole.
 * Petrol tag and yellow string on light ground; in the dark theme the tag turns yellow and
 * the string white. `compact` drops string and hole for small sizes (under 24 px).
 */
export function BrandMark({
  className,
  compact = false,
  onDark = false,
}: {
  className?: string;
  compact?: boolean;
  /** On a dark ground in both themes: the yellow tag with the white string */
  onDark?: boolean;
}) {
  if (compact) {
    return (
      <svg viewBox="0 0 40 40" aria-hidden="true" className={cn('h-6 w-6 shrink-0', className)}>
        <path
          className="fill-primary dark:fill-tag"
          fillRule="evenodd"
          d="M12 3h23a4 4 0 0 1 4 4v26a4 4 0 0 1-4 4H12L2 22a3.4 3.4 0 0 1 0-4ZM14 9h10.5a5.4 5.4 0 0 1 3.9 9.2A5.9 5.9 0 0 1 25 31H14Zm4.6 3.9v4.9h5.2a2.45 2.45 0 0 0 0-4.9Zm0 8.4v5.3h6a2.65 2.65 0 0 0 0-5.3Z"
        />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      className={cn('h-8 w-8 shrink-0', className)}
    >
      <path
        className={onDark ? 'fill-tag' : 'fill-primary dark:fill-tag'}
        fillRule="evenodd"
        transform="rotate(-12 21 21)"
        d="M16 6h17a4 4 0 0 1 4 4v22a4 4 0 0 1-4 4H16l-9.2-12.1a3.2 3.2 0 0 1 0-3.8ZM12.6 17.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4ZM19 12.5h7.2a4.1 4.1 0 0 1 3 6.9 4.4 4.4 0 0 1-2.7 8.1H19Zm3 2.6v3.7h3.8a1.85 1.85 0 0 0 0-3.7Zm0 6.2v3.6h4.4a1.8 1.8 0 0 0 0-3.6Z"
      />
      <path
        className={onDark ? 'stroke-white' : 'stroke-tag dark:stroke-white'}
        d="M12.8 22.7C7.6 19.6 4.4 12.4 7.6 4.4"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
