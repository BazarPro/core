import { useFormContext } from 'react-hook-form';
import { Label } from '../../../../components/ui/label';
import { Input } from '../../../../components/ui/input';
import { Textarea } from '../../../../components/ui/text-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../components/ui/select';
import { CONDITION_OPTIONS } from '../../../../constants/records';
import { PRODUCT_CONDITIONS } from '../../../../../convex/constants';
import { api } from '../../../../../convex/_generated/api';
import { useQuery } from 'convex/react';
import type { Doc } from '../../../../../convex/_generated/dataModel';
import { MyProductCategoryFields, MyProductNegotiation } from './MyProductExtras';
import { useTranslation } from 'react-i18next';

/** `allowOffers`: false for walk-in sellers, see MyProductNegotiation. */
export function MyProductBasicInfo({ allowOffers = true }: { allowOffers?: boolean }) {
  const { t } = useTranslation('seller');
  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = useFormContext();

  const categoryList = useQuery(api.categories.getAllCategories);

  // Watch values for controlled components like Select
  const categoryId = watch('categoryId');
  const condition = watch('condition');

  if (!categoryList) {
    return <div>{t('form.loading')}</div>;
  }

  return (
    <div className="bg-card rounded-lg border p-6 space-y-6">
      <div className="space-y-2">
        <Label htmlFor="title">{t('form.name')}</Label>
        <Input id="title" {...register('title')} placeholder={t('form.namePlaceholder')} />
        {errors.title && <p className="text-red-500 text-sm">{errors.title.message as string}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">{t('form.description')}</Label>
        <Textarea
          id="description"
          {...register('description')}
          placeholder={t('form.descriptionPlaceholder')}
          rows={4}
        />
        {errors.description && (
          <p className="text-red-500 text-sm">{errors.description.message as string}</p>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="condition">{t('form.condition')}</Label>
          <Select
            value={condition ?? ''}
            onValueChange={(val) => setValue('condition', val, { shouldValidate: true })}
          >
            <SelectTrigger id="condition">
              <SelectValue placeholder={t('form.chooseCondition')} />
            </SelectTrigger>
            <SelectContent>
              {PRODUCT_CONDITIONS.map((c: string) => (
                <SelectItem key={c} value={c}>
                  {CONDITION_OPTIONS[c as keyof typeof CONDITION_OPTIONS].title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.condition && (
            <p className="text-red-500 text-sm">{errors.condition.message as string}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="categoryId">{t('form.category')}</Label>
          <Select
            value={categoryId ?? ''}
            onValueChange={(val) => setValue('categoryId', val, { shouldValidate: true })}
          >
            <SelectTrigger id="categoryId">
              <SelectValue placeholder={t('form.chooseCategory')} />
            </SelectTrigger>
            <SelectContent>
              {categoryList.map((c: Doc<'categories'>) => (
                <SelectItem key={c._id} value={c._id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.categoryId && (
            <p className="text-red-500 text-sm">{errors.categoryId.message as string}</p>
          )}
        </div>
      </div>

      <MyProductCategoryFields />

      <div className="space-y-2">
        <Label htmlFor="price">{t('form.price')}</Label>
        <Input
          id="price"
          type="number"
          min="0"
          step="0.01"
          {...register('price', { valueAsNumber: true })}
          placeholder="0.00"
        />
        {errors.price && <p className="text-red-500 text-sm">{errors.price.message as string}</p>}
      </div>

      <MyProductNegotiation allowOffers={allowOffers} />
    </div>
  );
}
