import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * The browser's own select, for short lists in forms: on phones it opens the system picker.
 * Drawn like the other fields (border, arrow of the CategoryPicker) instead of the
 * browser's look; `className` sizes the field, e.g. its width.
 */
export const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<'select'>>(
  ({ className, ...props }, ref) => (
    <div className={cn('relative w-full', className)}>
      <select
        ref={ref}
        className="flex h-9 w-full appearance-none truncate rounded-md border border-input bg-input-background py-1 pl-3 pr-8 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:[color-scheme:dark]"
        {...props}
      />
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 opacity-50"
      />
    </div>
  )
);
NativeSelect.displayName = 'NativeSelect';
