import { cn } from '../../lib/utils';
import { initialOf, tintIndex } from '../../lib/productDisplay';

/**
 * Soft colour pairs for items without a photo. Picked by the category, so a list of
 * photo-less items reads like sorted tiles instead of a row of grey boxes.
 */
const TINTS = [
  'from-sky-100 to-sky-200/70 text-sky-700 dark:from-sky-950 dark:to-sky-900/60 dark:text-sky-300',
  'from-amber-100 to-amber-200/70 text-amber-700 dark:from-amber-950 dark:to-amber-900/60 dark:text-amber-300',
  'from-emerald-100 to-emerald-200/70 text-emerald-700 dark:from-emerald-950 dark:to-emerald-900/60 dark:text-emerald-300',
  'from-rose-100 to-rose-200/70 text-rose-700 dark:from-rose-950 dark:to-rose-900/60 dark:text-rose-300',
  'from-violet-100 to-violet-200/70 text-violet-700 dark:from-violet-950 dark:to-violet-900/60 dark:text-violet-300',
  'from-teal-100 to-teal-200/70 text-teal-700 dark:from-teal-950 dark:to-teal-900/60 dark:text-teal-300',
  'from-orange-100 to-orange-200/70 text-orange-700 dark:from-orange-950 dark:to-orange-900/60 dark:text-orange-300',
  'from-indigo-100 to-indigo-200/70 text-indigo-700 dark:from-indigo-950 dark:to-indigo-900/60 dark:text-indigo-300',
] as const;

/**
 * Stands in for the photo of an item that has none: its initial on a tint of its category.
 * `size` follows the space it fills: a list thumbnail, a card or a large tile.
 */
export function ProductPlaceholder({
  title,
  seed,
  size = 'md',
  className,
}: {
  title: string;
  /** Picks the colour; by the title, copies of an item look alike */
  seed: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br',
        TINTS[tintIndex(seed, TINTS.length)],
        className
      )}
    >
      {/* Faint dots so the area reads as a surface, not as a missing image */}
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)',
          backgroundSize: size === 'sm' ? '6px 6px' : '14px 14px',
        }}
      />
      {size === 'sm' ? (
        <span className="relative select-none text-xl font-bold leading-none">
          {initialOf(title)}
        </span>
      ) : (
        <span
          className={cn(
            'relative flex select-none items-center justify-center rounded-2xl bg-white/70 font-bold leading-none shadow-sm ring-1 ring-black/5 backdrop-blur-sm dark:bg-white/10 dark:ring-white/10',
            size === 'md' ? 'h-16 w-16 text-3xl' : 'h-24 w-24 text-5xl'
          )}
        >
          {initialOf(title)}
        </span>
      )}
    </div>
  );
}
