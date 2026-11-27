import { useState } from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { categoryName } from '../../i18n/categories';
import type { CategoryTranslations } from '../../lib/api/types';
import { cn } from '../../lib/utils';
import { groupCategories } from '../../shared/categoryTree';

type PickableCategory = {
  _id: string;
  label: string;
  parentCategory?: string;
  translations?: CategoryTranslations;
};

/**
 * The category of an item: first the main categories, a click opens one and shows its
 * sub-categories. Items go into sub-categories, so a main category with some is not
 * pickable itself. `isAllowed` leaves out what the chosen bazaars do not take.
 */
export function CategoryPicker({
  id,
  categories,
  value,
  onChange,
  isAllowed = () => true,
  disabled = false,
  invalid = false,
  placeholder,
}: {
  id?: string;
  categories: readonly PickableCategory[];
  value: string | undefined;
  onChange: (categoryId: string) => void;
  isAllowed?: (categoryId: string) => boolean;
  disabled?: boolean;
  invalid?: boolean;
  placeholder: string;
}) {
  const { t } = useTranslation('seller');
  const groups = groupCategories(categories)
    .map(({ category, children }) => ({
      category,
      children: children.filter((child) => isAllowed(child._id)),
      leaf: children.length === 0,
    }))
    .filter(({ category, children, leaf }) =>
      leaf ? isAllowed(category._id) : children.length > 0
    );
  const selected = categories.find((category) => category._id === value);
  const selectedMain = selected?.parentCategory
    ? categories.find((category) => category._id === selected.parentCategory)
    : undefined;
  // The group of the choice is open, or the only one there is
  const shownMain = groups.find(({ category }) => category._id === selectedMain?._id);
  const initiallyOpen =
    shownMain?.category._id ??
    (groups.length === 1 && !groups[0].leaf ? groups[0].category._id : undefined);
  const [open, setOpen] = useState<string | undefined>(initiallyOpen);

  return (
    <DropdownMenu onOpenChange={(isOpen) => isOpen && setOpen(initiallyOpen)}>
      <DropdownMenuTrigger
        id={id}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-input-background px-3 py-2 text-left text-sm outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30',
          !selected && 'text-muted-foreground'
        )}
      >
        <span className="truncate">
          {selected ? (
            <>
              {selectedMain && (
                <span className="text-muted-foreground">{categoryName(selectedMain)} › </span>
              )}
              {categoryName(selected)}
            </>
          ) : (
            placeholder
          )}
        </span>
        <ChevronDown className="size-4 shrink-0 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] w-(--radix-dropdown-menu-trigger-width) min-w-[16rem]"
      >
        {groups.length === 0 && (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">{t('form.noCategories')}</p>
        )}
        {groups.map(({ category, children, leaf }) => {
          if (leaf) {
            return (
              <DropdownMenuItem key={category._id} onSelect={() => onChange(category._id)}>
                <span className="flex-1">{categoryName(category)}</span>
                {value === category._id && <Check className="text-primary" />}
              </DropdownMenuItem>
            );
          }
          const isOpen = open === category._id;
          return (
            <div key={category._id}>
              <DropdownMenuItem
                aria-expanded={isOpen}
                // Opens or closes the group; the menu stays open
                onSelect={(event) => {
                  event.preventDefault();
                  setOpen(isOpen ? undefined : category._id);
                }}
                className={cn('font-medium', selectedMain?._id === category._id && 'text-primary')}
              >
                <span className="flex-1">{categoryName(category)}</span>
                <span className="text-xs font-normal text-muted-foreground">{children.length}</span>
                <ChevronRight className={cn('transition-transform', isOpen && 'rotate-90')} />
              </DropdownMenuItem>
              {isOpen &&
                children.map((child) => (
                  <DropdownMenuItem
                    key={child._id}
                    onSelect={() => onChange(child._id)}
                    className="pl-6"
                  >
                    <span className="flex-1">{categoryName(child)}</span>
                    {value === child._id && <Check className="text-primary" />}
                  </DropdownMenuItem>
                ))}
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
