import { Controller, useFormContext } from 'react-hook-form';
import { useQuery } from '../../../../lib/api/react';
import { api } from '../../../../lib/api/functions';
import { getCategoryFields } from '../../../../../convex/categoryFields';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Checkbox } from '../../../../components/ui/checkbox';
import { useTranslation } from 'react-i18next';
import { categoryFieldText } from '../../../../i18n/categoryFields';

/**
 * Extra fields of the selected category, e.g. frame number for bikes. `requiredFields`
 * are the keys a chosen bazaar requires; they are marked with an asterisk.
 */
export function MyProductCategoryFields({
  requiredFields = [],
  fixedFields = [],
}: {
  requiredFields?: string[];
  /** Keys a bazaar keeps on record; they cannot change any more */
  fixedFields?: string[];
}) {
  const {
    register,
    watch,
    formState: { errors },
  } = useFormContext();
  const categoryList = useQuery(api.categories.getAllCategories);
  const fields = getCategoryFields(watch('categoryId'), categoryList);
  const fieldErrors = errors.attributes as Record<string, { message?: string }> | undefined;

  if (fields.length === 0) return null;

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {fields.map((field) => (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={`attr-${field.key}`}>
            {categoryFieldText(field, 'label')}
            {requiredFields.includes(field.key) && ' *'}
          </Label>
          <Input
            id={`attr-${field.key}`}
            placeholder={categoryFieldText(field, 'placeholder')}
            maxLength={120}
            readOnly={fixedFields.includes(field.key) && !!watch(`attributes.${field.key}`)}
            {...register(`attributes.${field.key}`)}
          />
          {fieldErrors?.[field.key]?.message ? (
            <p className="text-sm text-destructive">{fieldErrors[field.key].message}</p>
          ) : (
            categoryFieldText(field, 'hint') && (
              <p className="text-xs text-muted-foreground">{categoryFieldText(field, 'hint')}</p>
            )
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Price negotiation settings. They only take effect at bazaars whose organizer
 * switched on price offers or negotiating, so they live on the product.
 * `allowOffers` is false for walk-in sellers: without an account nobody could answer
 * online offers, only the minimum price for the cash desk applies.
 */
export function MyProductNegotiation({ allowOffers = true }: { allowOffers?: boolean }) {
  const { t } = useTranslation('seller');
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext();

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
      <div>
        <div className="font-medium">{t('form.negotiable')}</div>
        <p className="text-xs text-muted-foreground">
          {allowOffers ? t('form.negotiableOffers') : t('form.negotiableCash')}
        </p>
      </div>
      {allowOffers && (
        <div className="flex items-start gap-3">
          <Controller
            name="acceptsOffers"
            control={control}
            render={({ field }) => (
              <Checkbox
                id="acceptsOffers"
                checked={!!field.value}
                onCheckedChange={(checked: boolean | string) => field.onChange(!!checked)}
                className="mt-0.5"
              />
            )}
          />
          <div className="space-y-1">
            <Label htmlFor="acceptsOffers" className="cursor-pointer leading-snug">
              {t('form.acceptsOffers')}
            </Label>
            <p className="text-xs text-muted-foreground">{t('form.acceptsOffersHint')}</p>
          </div>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="minimumPrice">{t('form.minimumPrice')}</Label>
        <Input
          id="minimumPrice"
          type="number"
          min="0"
          step="0.01"
          placeholder={t('form.minimumPlaceholder')}
          {...register('minimumPrice', {
            setValueAs: (value) => (value === '' || value === null ? undefined : Number(value)),
          })}
        />
        <p className="text-xs text-muted-foreground">{t('form.minimumHint')}</p>
        {errors.minimumPrice && (
          <p className="text-red-500 text-sm">{errors.minimumPrice.message as string}</p>
        )}
      </div>
    </div>
  );
}
