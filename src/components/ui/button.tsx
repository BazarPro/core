import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';

import { cn } from '../utils';
import { buttonVariants, loadingButtonClass } from './button-variants';

/** Spinner of a busy button, see `loading`. */
function ButtonSpinner() {
  return <Loader2 data-spinner className="mr-2 h-4 w-4 animate-spin" />;
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  children,
  disabled,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
  }) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }), loading && loadingButtonClass)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <ButtonSpinner />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { Button, ButtonSpinner };
