import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '../../../lib/api/react';
import { api } from '../../../lib/api/functions';
import { cn } from '../../../lib/utils';

/** Renders the page for platform administrators only. */
export function AdminGuard({ children }: { children: ReactNode }) {
  const user = useQuery(api.users.viewer);
  if (user === undefined) {
    return null;
  }
  if (!user || user.systemRole !== 'admin') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-muted-foreground">{description}</p>
      </div>
      {actions}
    </div>
  );
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
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-muted p-1" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            value === option.value
              ? 'bg-background shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {option.label}
          {option.count !== undefined && option.count > 0 && (
            <span className="ml-1.5 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
              {option.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed bg-card p-10 text-center text-muted-foreground">
      {children}
    </div>
  );
}
