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

export function MyProductBasicInfo() {
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
    return <div>Laden...</div>;
  }

  return (
    <div className="bg-card rounded-lg border p-6 space-y-6">
      <div className="space-y-2">
        <Label htmlFor="title">Produktname *</Label>
        <Input id="title" {...register('title')} placeholder="z.B. Fischer RC4 Slalom Ski 165cm" />
        {errors.title && <p className="text-red-500 text-sm">{errors.title.message as string}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Beschreibung</Label>
        <Textarea
          id="description"
          {...register('description')}
          placeholder="Beschreibe dein Produkt..."
          rows={4}
        />
        {errors.description && (
          <p className="text-red-500 text-sm">{errors.description.message as string}</p>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
        <Label htmlFor="condition">Zustand *</Label>
          <Select
            value={condition ?? ''}
            onValueChange={(val) => setValue('condition', val, { shouldValidate: true })}
          >
            <SelectTrigger id="condition">
              <SelectValue placeholder="Zustand wählen" />
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
        <Label htmlFor="categoryId">Kategorie *</Label>
          <Select
            value={categoryId ?? ''}
            onValueChange={(val) => setValue('categoryId', val, { shouldValidate: true })}
          >
            <SelectTrigger id="categoryId">
              <SelectValue placeholder="Kategorie wählen" />
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

      <div className="space-y-2">
        <Label htmlFor="price">Preis (€) *</Label>
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
    </div>
  );
}
