import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';

/** A key figure that links to its page. `urgent` marks something that needs doing. */
export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  to,
  urgent,
}: {
  icon: LucideIcon;
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  to: string;
  urgent?: boolean;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-4 rounded-xl border bg-card p-4 shadow-xs transition-colors hover:bg-muted/50 sm:p-5"
    >
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground',
          urgent && 'bg-primary/10 text-primary dark:bg-primary/25 dark:text-foreground'
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-muted-foreground">{label}</span>
        <span
          className={cn(
            'block whitespace-nowrap text-2xl font-semibold tabular-nums',
            urgent && 'text-primary dark:text-foreground'
          )}
        >
          {value}
        </span>
        {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
