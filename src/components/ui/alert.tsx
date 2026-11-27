import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../lib/utils';

const alertVariants = cva(
  'relative w-full rounded-lg border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
  {
    variants: {
      variant: {
        // Every notice the same way: a tinted ground, its own text colour, a line in the colour
        default:
          'border-primary/25 bg-primary/[0.06] text-foreground [&>svg]:text-primary dark:bg-primary/10',
        destructive:
          'text-danger-soft-foreground border-destructive/40 bg-danger-soft [&>svg]:text-current *:data-[slot=alert-description]:text-danger-soft-foreground',
        success:
          'text-success-soft-foreground border-success/40 bg-success-soft [&>svg]:text-current *:data-[slot=alert-description]:text-success-soft-foreground',
        warning:
          'text-warning-soft-foreground border-warning-soft-foreground/30 bg-warning-soft [&>svg]:text-current *:data-[slot=alert-description]:text-warning-soft-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn('col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight', className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        'text-muted-foreground col-start-2 grid justify-items-start gap-1 text-sm [&_p]:leading-relaxed',
        className
      )}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };
