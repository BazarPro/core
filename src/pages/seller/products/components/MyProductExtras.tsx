import { Controller, useFormContext } from 'react-hook-form';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { getCategoryFields } from '../../../../../convex/categoryFields';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Checkbox } from '../../../../components/ui/checkbox';

/** Extra fields of the selected category, e.g. frame number for bikes. */
export function MyProductCategoryFields() {
  const { register, watch } = useFormContext();
  const categoryList = useQuery(api.categories.getAllCategories);
  const fields = getCategoryFields(watch('categoryId'), categoryList);

  if (fields.length === 0) return null;

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {fields.map((field) => (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={`attr-${field.key}`}>{field.label}</Label>
          <Input
            id={`attr-${field.key}`}
            placeholder={field.placeholder}
            maxLength={120}
            {...register(`attributes.${field.key}`)}
          />
          {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
        </div>
      ))}
    </div>
  );
}

/**
 * Price negotiation settings. They only take effect at bazaars whose organizer
 * switched on price offers or negotiating, so they live on the product.
 */
export function MyProductNegotiation() {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext();

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
      <div>
        <div className="font-medium">Preis verhandelbar?</div>
        <p className="text-xs text-muted-foreground">
          Gilt nur bei Veranstaltungen, die Preisvorschläge oder Verhandeln anbieten.
        </p>
      </div>
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
        <Label htmlFor="acceptsOffers" className="cursor-pointer leading-snug">
          Käufer dürfen mir online einen Preis vorschlagen
          <span className="block text-xs font-normal text-muted-foreground">
            Du entscheidest bei jedem Vorschlag, ob du annimmst.
          </span>
        </Label>
      </div>
      <div className="space-y-2">
        <Label htmlFor="minimumPrice">Mindestpreis (€, optional)</Label>
        <Input
          id="minimumPrice"
          type="number"
          min="0"
          step="0.01"
          placeholder="z. B. 80"
          {...register('minimumPrice', {
            setValueAs: (value) => (value === '' || value === null ? undefined : Number(value)),
          })}
        />
        <p className="text-xs text-muted-foreground">
          Käufer sehen ihn nicht. Die Kasse darf bis zu diesem Preis heruntergehen.
        </p>
        {errors.minimumPrice && (
          <p className="text-red-500 text-sm">{errors.minimumPrice.message as string}</p>
        )}
      </div>
    </div>
  );
}
