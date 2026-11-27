import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { cn } from '../../lib/utils';

/**
 * An on/off switch. Underneath a checkbox, so it reads and behaves like one for screen
 * readers and tests; only the look says "switch".
 */
function Switch({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer group relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-input transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary dark:data-[state=checked]:bg-primary',
        className
      )}
      {...props}
    >
      <span
        aria-hidden
        className="pointer-events-none block h-5 w-5 translate-x-0.5 rounded-full bg-background shadow-sm dark:bg-muted-foreground dark:group-data-[state=checked]:bg-primary-foreground ring-0 transition-transform group-data-[state=checked]:translate-x-[1.05rem]"
      />
    </CheckboxPrimitive.Root>
  );
}

export { Switch };
