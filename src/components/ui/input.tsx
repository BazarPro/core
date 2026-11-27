import * as React from 'react';

import { cn } from '../../lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base bg-input-background transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-ring focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:bg-card',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        // Locked (e.g. dates of a running bazaar): no fill and a dashed frame, unlike a field to type in
        '[&[readonly]]:cursor-not-allowed [&[readonly]]:border-dashed [&[readonly]]:bg-transparent [&[readonly]]:text-muted-foreground',
        className
      )}
      {...props}
    />
  );
}

export { Input };
