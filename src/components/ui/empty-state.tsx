import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/** Shown instead of a list or page without content: what is missing and what to do. */
export function EmptyState({
  icon: Icon,
  title,
  text,
  children,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  text?: ReactNode;
  /** The actions */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-dashed bg-card p-10 text-center', className)}>
      {Icon && <Icon className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" />}
      <p className={text || children ? 'font-medium' : 'text-muted-foreground'}>{title}</p>
      {text && <p className="mt-1 text-sm text-muted-foreground">{text}</p>}
      {children && <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}
