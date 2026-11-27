import { FormSection } from '../../../../components/ui/form-section';
import { FieldError } from '../../../../components/ui/field-error';
import { useFormContext } from 'react-hook-form';
import { Label } from '../../../../components/ui/label';
import { Checkbox } from '../../../../components/ui/checkbox';
import type { Doc } from '../../../../lib/api/types';
import { useEffect, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { InfoTip } from '../../../../components/ui/info-tip';
import { useServiceLabel, useServices } from '../../../../i18n/services';
import { categoryName } from '../../../../i18n/categories';
import {
  compactSelection,
  expandSelection,
  groupCategories,
} from '../../../../shared/categoryTree';
import { cn } from '../../../../lib/utils';

type EventCategoriesProbs = {
  categoryList: Doc<'categories'>[];
};

/**
 * The categories a bazaar allows: one row per main category with a checkbox for all of
 * it; opened, its sub-categories can be chosen one by one.
 */
function AllowedCategories({ categoryList }: EventCategoriesProbs) {
  const { t } = useTranslation('organizer');
  const { watch, setValue } = useFormContext();
  const [open, setOpen] = useState<string[]>([]);
  const list = categoryList.map((category) => ({ ...category, _id: String(category._id) }));
  const groups = groupCategories(list);
  const stored: string[] = watch('categories') || [];
  const selected = expandSelection(stored, list);

  const choose = (next: Set<string>) =>
    setValue('categories', compactSelection(next, list), {
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true,
    });
  const setAll = (ids: string[], on: boolean) => {
    const next = new Set(selected);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    choose(next);
  };
  const toggleOpen = (id: string) =>
    setOpen((current) =>
      current.includes(id) ? current.filter((other) => other !== id) : [...current, id]
    );
  const everything = groups.flatMap(({ category, children }) =>
    children.length ? children.map((child) => child._id) : [category._id]
  );
  const chosenGroups = groups.filter(({ category, children }) =>
    (children.length ? children : [category]).some((c) => selected.has(c._id))
  ).length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="flex items-center gap-1">
            <Label>{t('categories.allowed')}</Label>
            <InfoTip>{t('categories.allowedHint')}</InfoTip>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('categories.chosenSummary', { count: chosenGroups, total: groups.length })}
          </p>
        </div>
        <div className="flex gap-1 text-sm">
          <button
            type="button"
            className="rounded px-2 py-1 text-primary hover:bg-muted"
            onClick={() => setAll(everything, true)}
          >
            {t('categories.selectAll')}
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 text-primary hover:bg-muted"
            onClick={() => setAll(everything, false)}
          >
            {t('categories.selectNone')}
          </button>
        </div>
      </div>
      <div className="divide-y rounded-lg border">
        {groups.map(({ category, children }) => {
          const ids = children.length ? children.map((child) => child._id) : [category._id];
          const count = ids.filter((id) => selected.has(id)).length;
          const state =
            count === 0 ? false : count === ids.length ? true : ('indeterminate' as const);
          const isOpen = open.includes(category._id);
          const id = `allowed-${category._id}`;
          return (
            <div key={category._id}>
              <div className="flex items-center gap-3 px-3 py-2">
                <Checkbox
                  id={id}
                  checked={state}
                  onCheckedChange={() => setAll(ids, state !== true)}
                />
                <label htmlFor={id} className="flex-1 cursor-pointer text-sm font-medium">
                  {categoryName(category)}
                </label>
                {children.length > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleOpen(category._id)}
                    aria-expanded={isOpen}
                    aria-label={t('categories.subcategories', { name: categoryName(category) })}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {count === ids.length
                      ? t('categories.chosenAll')
                      : t('categories.chosenSome', { count, total: ids.length })}
                    <ChevronRight
                      className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-90')}
                    />
                  </button>
                )}
              </div>
              {isOpen && (
                <div className="grid gap-x-4 gap-y-1.5 bg-muted/30 px-3 py-3 pl-10 sm:grid-cols-2 lg:grid-cols-3">
                  {children.map((child) => {
                    const childId = `allowed-${child._id}`;
                    return (
                      <div key={child._id} className="flex items-center gap-2">
                        <Checkbox
                          id={childId}
                          checked={selected.has(child._id)}
                          onCheckedChange={(on) => setAll([child._id], on === true)}
                        />
                        <label htmlFor={childId} className="cursor-pointer text-sm">
                          {categoryName(child)}
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function EditEventCategories({ categoryList }: EventCategoriesProbs) {
  const { t } = useTranslation('organizer');
  const {
    watch,
    setValue,
    register,
    formState: { errors },
  } = useFormContext();

  const services: string[] = watch('services') || [];
  const available = useServices();
  const serviceLabel = useServiceLabel();

  useEffect(() => {
    register('categories');
    register('services');
  }, [register]);

  const toggleService = (svc: string) => {
    const current = services.includes(svc)
      ? services.filter((s: string) => s !== svc)
      : [...services, svc];
    setValue('services', current, { shouldValidate: true, shouldDirty: true, shouldTouch: true });
  };

  return (
    <FormSection>
      <AllowedCategories categoryList={categoryList} />
      {errors.categories && <FieldError>{errors.categories.message as string}</FieldError>}

      <div className="space-y-2">
        <Label>{t('categories.services')}</Label>
        <div className="flex flex-wrap gap-2 mb-2">
          {/* Chips to switch on and off: buttons, so they work with the keyboard too */}
          {(available ?? []).map(({ name: svc }) => {
            const on = services.includes(svc);
            return (
              <button
                key={svc}
                type="button"
                aria-pressed={on}
                onClick={() => toggleService(svc)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  on
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-card text-foreground hover:bg-accent dark:bg-transparent'
                )}
              >
                {on && <Check className="size-3.5" aria-hidden />}
                {serviceLabel(svc)}
              </button>
            );
          })}
        </div>
      </div>
    </FormSection>
  );
}
