import { LayoutGrid, List } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import type { ProductViewMode } from '../../lib/productDisplay';

/** Two buttons, tiles and list, the active one raised. */
export function ViewModeToggle({
  value,
  onChange,
  className,
}: {
  value: ProductViewMode;
  onChange: (mode: ProductViewMode) => void;
  className?: string;
}) {
  const { t } = useTranslation('common');
  const options = [
    { mode: 'grid' as const, icon: LayoutGrid, label: t('view.grid') },
    { mode: 'list' as const, icon: List, label: t('view.list') },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={t('view.label')}
      className={cn(
        'inline-flex h-9 shrink-0 items-center rounded-md border bg-muted/60 p-0.5',
        className
      )}
    >
      {options.map(({ mode, icon: Icon, label }) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={value === mode}
          aria-label={label}
          title={label}
          onClick={() => onChange(mode)}
          className={cn(
            'flex h-full w-8 items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === mode && 'bg-background text-foreground shadow-sm'
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
