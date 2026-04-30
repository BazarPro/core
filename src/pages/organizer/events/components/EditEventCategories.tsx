import { useFormContext } from 'react-hook-form';
import { Label } from '../../../../components/ui/label';
import { Badge } from '../../../../components/ui/badge';
import { EVENT_SERVICES } from '../../../../../convex/constants';
import type { Doc } from '../../../../../convex/_generated/dataModel';
import { useEffect } from 'react';

type EventCategoriesProbs = {
  categoryList: Doc<'categories'>[];
};

export function EditEventCategories({ categoryList }: EventCategoriesProbs) {
  const {
    watch,
    setValue,
    register,
    formState: { errors },
  } = useFormContext();

  const categories: string[] = watch('categories') || [];
  const services: string[] = watch('services') || [];

  useEffect(() => {
    register('categories');
    register('services');
  }, [register]);

  const toggleCategory = (catId: string) => {
    const id = String(catId);
    const current = categories.includes(id)
      ? categories.filter((c: string) => c !== id)
      : [...categories, id];

    console.log('Toggling Category:', id, 'New State:', current);
    setValue('categories', current, { shouldValidate: true, shouldDirty: true, shouldTouch: true });
  };

  const toggleService = (svc: string) => {
    const current = services.includes(svc)
      ? services.filter((s: string) => s !== svc)
      : [...services, svc];
    setValue('services', current, { shouldValidate: true, shouldDirty: true, shouldTouch: true });
  };

  return (
    <div className="bg-card rounded-lg border p-6 space-y-6">
      <h2 className="text-2xl">Kategorien & Services</h2>

      <div className="space-y-2">
        <Label>Erlaubte Produktkategorien *</Label>
        <div className="flex flex-wrap gap-2 mb-2">
          {categoryList.map((cat) => {
            const catId = String(cat._id);
            return (
              <Badge
                key={catId}
                variant={categories.includes(catId) ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => toggleCategory(catId)}
              >
                {cat.label}
              </Badge>
            );
          })}
        </div>
        {errors.categories && (
          <p className="text-red-500 text-sm">{errors.categories.message as string}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Zusätzliche Services</Label>
        <div className="flex flex-wrap gap-2 mb-2">
          {EVENT_SERVICES.map((svc) => (
            <Badge
              key={svc}
              variant={services.includes(svc) ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => toggleService(svc)}
            >
              {svc}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
