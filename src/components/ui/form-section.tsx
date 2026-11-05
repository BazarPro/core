import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/** One block of a form: a card with an optional title and intro, used by all event forms. */
export function FormSection({
  title,
  description,
  children,
  className,
  contentClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section className={cn('rounded-xl border bg-card p-5 shadow-xs sm:p-6', className)}>
      {(title || description) && (
        <div className="mb-5">
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      )}
      <div className={cn('space-y-5', contentClassName)}>{children}</div>
    </section>
  );
}

/** Rows split by lines instead of cards inside a card: `contentClassName` of a FormSection. */
export const FORM_ROWS = 'space-y-0 divide-y *:py-4 *:first:pt-0 *:last:pb-0';
