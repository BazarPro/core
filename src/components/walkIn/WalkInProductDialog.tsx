import { useEffect, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from 'convex/react';
import { toast } from 'sonner';
import { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
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
import { ImageUpload } from '../ui/ImageUpload';
import { Label } from '../ui/label';
import { MyProductBasicInfo } from '../../pages/seller/products/components/MyProductBasicInfo';
import {
  isMinimumPriceBelowPrice,
  minimumPriceError,
  productExtrasDefaults,
  productExtrasFields,
  productExtrasPayload,
} from '../../lib/productExtras';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { useTranslation } from 'react-i18next';
import { zodMessage } from '../../i18n/zodMessage';

const walkInProductSchema = z
  .object({
    title: z.string().min(3, zodMessage('form.titleTooShort', 'seller')),
    description: z.string(),
    condition: z.enum(PRODUCT_CONDITIONS, zodMessage('form.conditionRequired', 'seller')),
    categoryId: z.string().min(1, zodMessage('form.categoryRequired', 'seller')),
    price: z
      .number(zodMessage('walkIn.priceRequired', 'organizer'))
      .min(0, zodMessage('form.priceNegative', 'seller')),
    ...productExtrasFields(),
  })
  .refine(isMinimumPriceBelowPrice, minimumPriceError());

type WalkInProductFormData = z.infer<typeof walkInProductSchema>;

const EMPTY_FORM = {
  title: '',
  description: '',
  categoryId: '',
  price: 0,
  ...productExtrasDefaults(),
};

/** The form for an existing item, e.g. to fix a typo in title or price. */
function formFor(product: Doc<'products'>): WalkInProductFormData {
  return {
    title: product.title,
    description: product.description,
    condition: product.condition,
    categoryId: product.productCategory,
    price: product.price,
    ...productExtrasDefaults(product),
  };
}

/**
 * Organizer records an item for a walk-in seller, or changes one (`product`);
 * photos are optional. New photos of a changed item replace the old ones.
 */
export function WalkInProductDialog({
  eventId,
  sellerId,
  sellerName,
  product,
  open,
  onOpenChange,
}: {
  eventId: Id<'events'>;
  sellerId: Id<'users'>;
  sellerName: string;
  product?: Doc<'products'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('organizer');
  const saveProduct = useMutation(api.walkInSellers.saveWalkInProduct);
  const generateUploadUrl = useMutation(api.products.generateUploadUrl);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  // Remounts the upload field, so it starts empty for the next item
  const [uploadKey, setUploadKey] = useState(0);
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
    if (open) {
      reset(product ? formFor(product) : EMPTY_FORM);
      setImageFiles([]);
      setUploadKey((key) => key + 1);
    }
    // Only when the dialog opens: live updates of the item must not reset the form
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reset]);

  const uploadImages = async () => {
    const ids: Id<'_storage'>[] = [];
    for (const file of imageFiles) {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!result.ok) throw new Error(t('walkIn.uploadFailed'));
      const { storageId } = await result.json();
      ids.push(storageId);
    }
    return ids;
  };

  const onSubmit = async (data: WalkInProductFormData, keepOpen: boolean) => {
    try {
      const images = await uploadImages();
      await saveProduct({
        eventId,
        sellerId,
        productId: product?._id,
        // Without new photos a changed item keeps its old ones
        images: product && images.length === 0 ? undefined : images,
        title: data.title,
        description: data.description,
        condition: data.condition,
        productCategory: data.categoryId as Id<'categories'>,
        price: data.price,
        ...productExtrasPayload(data),
      });
      toast.success(
        product
          ? t('walkIn.itemUpdated', { title: data.title })
          : t('walkIn.itemSaved', { title: data.title })
      );
      if (keepOpen) {
        // Keep the category for the next item, the rest starts empty
        reset({ ...EMPTY_FORM, categoryId: data.categoryId, condition: data.condition });
        setImageFiles([]);
        setUploadKey((key) => key + 1);
      } else {
        onOpenChange(false);
      }
    } catch (error) {
      toast.error(t('walkIn.itemFailed'), {
        description: getUserFacingErrorMessage(error),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {product
              ? t('walkIn.editItemTitle', { name: sellerName })
              : t('walkIn.itemTitle', { name: sellerName })}
          </DialogTitle>
          <DialogDescription>
            {product ? t('walkIn.editItemText') : t('walkIn.itemText')}
          </DialogDescription>
        </DialogHeader>
        <FormProvider {...methods}>
          <form onSubmit={handleSubmit((data) => onSubmit(data, false))}>
            <MyProductBasicInfo allowOffers={false} />
            <div className="mt-4 space-y-2">
              <Label>{t('walkIn.images')}</Label>
              {product && product.images.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t('walkIn.existingPhotos', { count: product.images.length })}
                </p>
              )}
              <ImageUpload key={uploadKey} onFilesChange={setImageFiles} />
            </div>
            <DialogFooter className="mt-4 gap-2">
              {!product && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={handleSubmit((data) => onSubmit(data, true))}
                >
                  {t('walkIn.saveNext')}
                </Button>
              )}
              <Button type="submit" disabled={isSubmitting}>
                {t('walkIn.save')}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
