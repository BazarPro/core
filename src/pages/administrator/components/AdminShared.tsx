import { Navigate, Outlet } from 'react-router-dom';
import { useQuery } from '../../../lib/api/react';
import { api } from '../../../lib/api/functions';
import { cn } from '../../../lib/utils';
import { PageSkeleton } from '../../../components/ui/loading';

/** Layout route: its pages are for platform administrators only. */
export function AdminGuard() {
  const user = useQuery(api.users.viewer);
  if (user === undefined) {
    return <PageSkeleton />;
  }
  if (!user || user.systemRole !== 'admin') {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

/** Pill-style filter tabs used across the admin pages. */
export function FilterTabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; count?: number }[];
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-[3px]" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'cursor-pointer rounded-md px-3 py-1 text-sm font-medium transition-colors',
            value === option.value
              ? 'bg-card text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {option.label}
          {option.count !== undefined && option.count > 0 && (
            <span className="ml-1.5 rounded-full bg-foreground/10 px-1.5 text-xs tabular-nums">
              {option.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
