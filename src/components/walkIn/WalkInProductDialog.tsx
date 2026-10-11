import { useEffect } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from 'convex/react';
import { toast } from 'sonner';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { PRODUCT_CONDITIONS } from '../../../convex/constants';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { MyProductBasicInfo } from '../../pages/seller/products/components/MyProductBasicInfo';
import {
  isMinimumPriceBelowPrice,
  minimumPriceError,
  productExtrasDefaults,
  productExtrasFields,
  productExtrasPayload,
} from '../../lib/productExtras';
import { getUserFacingErrorMessage } from '../../lib/errors';

const walkInProductSchema = z
  .object({
    title: z.string().min(3, 'Produkttitel muss mindestens 3 Zeichen haben'),
    description: z.string(),
    condition: z.enum(PRODUCT_CONDITIONS, { message: 'Zustand ist erforderlich' }),
    categoryId: z.string().min(1, 'Kategorie ist erforderlich'),
    price: z.number({ message: 'Preis ist erforderlich' }).min(0, 'Preis darf nicht negativ sein'),
    ...productExtrasFields,
  })
  .refine(isMinimumPriceBelowPrice, minimumPriceError);

type WalkInProductFormData = z.infer<typeof walkInProductSchema>;

const EMPTY_FORM = {
  title: '',
  description: '',
  categoryId: '',
  price: 0,
  ...productExtrasDefaults(),
};

/** Organizer records an item for a walk-in seller (no photos needed). */
export function WalkInProductDialog({
  eventId,
  sellerId,
  sellerName,
  open,
  onOpenChange,
}: {
  eventId: Id<'events'>;
  sellerId: Id<'users'>;
  sellerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const saveProduct = useMutation(api.walkInSellers.saveWalkInProduct);
  const methods = useForm<WalkInProductFormData>({
    resolver: zodResolver(walkInProductSchema),
    defaultValues: EMPTY_FORM,
  });
  const {
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = methods;

  useEffect(() => {
    if (open) reset(EMPTY_FORM);
  }, [open, reset]);

  const onSubmit = async (data: WalkInProductFormData, keepOpen: boolean) => {
    try {
      await saveProduct({
        eventId,
        sellerId,
        title: data.title,
        description: data.description,
        condition: data.condition,
        productCategory: data.categoryId as Id<'categories'>,
        price: data.price,
        ...productExtrasPayload(data),
      });
      toast.success(`„${data.title}“ erfasst`);
      if (keepOpen) {
        // Keep the category for the next item, the rest starts empty
        reset({ ...EMPTY_FORM, categoryId: data.categoryId, condition: data.condition });
      } else {
        onOpenChange(false);
      }
    } catch (error) {
      toast.error('Artikel konnte nicht gespeichert werden', {
        description: getUserFacingErrorMessage(error),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Artikel für {sellerName} erfassen</DialogTitle>
          <DialogDescription>
            Der Artikel wird als „angemeldet“ angelegt. Danach wie gewohnt annehmen und den QR-Code
            drucken.
          </DialogDescription>
        </DialogHeader>
        <FormProvider {...methods}>
          <form onSubmit={handleSubmit((data) => onSubmit(data, false))}>
            <MyProductBasicInfo />
            <DialogFooter className="mt-4 gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={handleSubmit((data) => onSubmit(data, true))}
              >
                Speichern & nächster
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                Speichern
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
