import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/** Title of a page, with its actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description && <div className="mt-1 text-muted-foreground">{description}</div>}
      </div>
      {actions}
    </div>
  );
}
