import * as React from 'react';
import { cn } from '../../lib/utils';

/** The browser's own select, for short lists in forms: on phones it opens the system picker. */
export const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<'select'>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-input-background px-3 py-1 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:[color-scheme:dark]',
        className
      )}
      {...props}
    />
  )
);
NativeSelect.displayName = 'NativeSelect';
