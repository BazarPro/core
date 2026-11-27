import { CONDITION_OPTIONS } from '../../constants/records';
import { PRODUCT_CONDITIONS, type ProductContitions } from '../../shared/constants';
import { cn } from '../../lib/utils';

/** The condition of an item as tiles, one click picks one; the description is the tooltip. */
export function ConditionPicker({
  value,
  onChange,
  label,
}: {
  value: string | undefined;
  onChange: (condition: ProductContitions) => void;
  label: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="radiogroup" aria-label={label}>
      {PRODUCT_CONDITIONS.map((condition) => {
        const checked = value === condition;
        return (
          <button
            key={condition}
            type="button"
            role="radio"
            aria-checked={checked}
            title={CONDITION_OPTIONS[condition].description}
            onClick={() => onChange(condition)}
            className={cn(
              'min-h-9 rounded-md border px-3 py-1.5 text-left text-sm leading-snug transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
              checked
                ? 'border-primary bg-primary/10 font-medium text-primary dark:bg-primary/25 dark:text-foreground'
                : 'bg-card hover:bg-accent'
            )}
          >
            {CONDITION_OPTIONS[condition].title}
          </button>
        );
      })}
    </div>
  );
}
