import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../../components/ui/button';

import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MyProductBasicInfo } from './components/MyProductBasicInfo';
import { MyProductEditImages } from './components/MyProductEditImages';
import { MyProductSelectEvents } from './components/MyProductSelectEvents';
import { PRODUCT_CONDITIONS } from '../../../../convex/constants';
import { resolveEventFeatures } from '../../../../convex/eventFeatures';
import {
  isMinimumPriceBelowPrice,
  minimumPriceError,
  productExtrasDefaults,
  productExtrasFields,
  productExtrasPayload,
} from '../../../lib/productExtras';
import { toast } from 'sonner';
import { getUserFacingErrorMessage } from '../../../lib/errors';
import { setParticipantOnboardingPending } from '../../../lib/onboardingTrigger';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Lock, Trash2 } from 'lucide-react';
import { BackButton } from '../../../components/navigation/BackButton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../../components/ui/alert-dialog';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

/**
 * Create / Edit Form for a Users Product
 */

function buildProductSchema(t: TFunction<'seller'>) {
  return z
    .object({
      title: z.string().min(3, t('form.titleTooShort')),
      description: z.string(),
      condition: z
        .enum(PRODUCT_CONDITIONS)
        .optional()
        .refine((value) => value !== undefined, {
          message: t('form.conditionRequired'),
        }),
      imageFiles: z.array(z.instanceof(File)).optional(),
      categoryId: z.string().min(1, t('form.categoryRequired')),
      price: z.number().min(0, t('form.priceNegative')),
      readyForSale: z.boolean(),

      //to add product to events:
      eventIds: z.optional(z.array(z.string())),
      ...productExtrasFields(),
    })
    .refine(isMinimumPriceBelowPrice, minimumPriceError());
}

type ProductFormData = z.infer<ReturnType<typeof buildProductSchema>>;

export function ProductForm() {
  const { t } = useTranslation('seller');
  const productSchema = useMemo(() => buildProductSchema(t), [t]);
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  let productId = params.productId as Id<'products'> | undefined;

  const currentUser = useQuery(api.users.viewer);
  const registeredEvents = useQuery(api.events.getMyRegisteredEvents, { includePast: true });
  const isLocked = useQuery(
    api.eventProducts.isProductLockedForSeller,
    productId ? { productId } : 'skip'
  );
  const canDelete =
    useQuery(api.products.canDeleteProduct, productId ? { productId } : 'skip') ?? !isLocked;

  const addProduct = useMutation(api.products.addProduct);
  const updateProduct = useMutation(api.products.updateProduct);
  const setProductEvents = useMutation(api.eventProducts.setProductEvents);
  const generateUploadUrl = useMutation(api.products.generateUploadUrl);
  const deleteProduct = useMutation(api.products.deleteProduct);

  const isEditing = !!productId;

  const product = useQuery(api.products.getProduct, isEditing ? { productId: productId! } : 'skip');
  const productEventIds = useQuery(
    api.eventProducts.getEventIdsForProduct,
    isEditing && productId ? { productId: productId! } : 'skip'
  );

  const existingImageUrlsQuery = useQuery(
    api.products.getImageUrls,
    isEditing && product && product.images.length > 0 ? { storageIds: product.images } : 'skip'
  );

  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]);
  const [existingImageIds, setExistingImageIds] = useState<Id<'_storage'>[]>([]);

  const methods = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      title: '',
      description: '',
      condition: undefined,
      categoryId: '',
      price: 0,
      eventIds: location.state?.initialEventId ? [location.state.initialEventId] : [],
      imageFiles: [],
      readyForSale: true,
      ...productExtrasDefaults(),
    },
  });

  const {
    handleSubmit,
    reset,
    setError,
    clearErrors,
    formState: { isSubmitting },
  } = methods;

  useEffect(() => {
    if (product && productEventIds !== undefined) {
      reset({
        title: product.title,
        description: product.description,
        condition: product.condition ?? 'very-good',
        categoryId: product.productCategory,
        price: product.price,
        imageFiles: [],
        readyForSale: product.readyForSale,
        eventIds: productEventIds,
        ...productExtrasDefaults(product),
      });
      setExistingImageIds(product.images);
    }
  }, [product, productEventIds, reset]);

  useEffect(() => {
    if (existingImageUrlsQuery) {
      setExistingImageUrls(existingImageUrlsQuery.filter(Boolean) as string[]);
    }
  }, [existingImageUrlsQuery]);

  const onSubmit = async (data: ProductFormData) => {
    if (!currentUser) return;
    if (isEditing && product?.isLocked) {
      toast.error(t('form.locked'));
      return;
    }

    // A photo is required unless every chosen bazaar allows items without one
    const chosenEvents = (registeredEvents ?? []).filter((event) =>
      data.eventIds?.includes(event._id)
    );
    const photoOptional =
      chosenEvents.length > 0 &&
      chosenEvents.every((event) => resolveEventFeatures(event).photosOptional);
    const incomingImagesCount = data.imageFiles?.length ?? 0;
    if (!photoOptional && existingImageIds.length + incomingImagesCount === 0) {
      setError('imageFiles', {
        type: 'manual',
        message: t('form.imageRequired'),
      });
      return;
    }
    clearErrors('imageFiles');

    if (!data.condition) {
      setError('condition', {
        type: 'manual',
        message: t('form.conditionRequired'),
      });
      return;
    }
    clearErrors('condition');

    const newImageStorageIds: Id<'_storage'>[] = [];

    if (data.imageFiles) {
      for (const file of data.imageFiles) {
        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': file.type },
          body: file,
        });
        const { storageId } = await result.json();
        newImageStorageIds.push(storageId);
      }
    }

    const finalImageIds = [...existingImageIds, ...newImageStorageIds];
    const shouldStartOnboardingAfterCreate = !isEditing && Boolean(location.state?.initialEventId);

    try {
      if (isEditing && productId) {
        await updateProduct({
          productId,
          title: data.title,
          description: data.description,
          condition: data.condition,
          productCategory: data.categoryId as Id<'categories'>,
          images: finalImageIds,
          price: data.price,
          readyForSale: true,
          ...productExtrasPayload(data),
        });
        toast.success(t('form.updated'));
      } else {
        productId = await addProduct({
          title: data.title,
          vendorId: currentUser._id,
          description: data.description,
          condition: data.condition,
          images: finalImageIds,
          productCategory: data.categoryId as Id<'categories'>,
          price: data.price,
          readyForSale: true,
          sold: false,
          ...productExtrasPayload(data),
        });
        toast.success(t('form.created'));
        if (shouldStartOnboardingAfterCreate) {
          setParticipantOnboardingPending();
        }
      }

      if (data.eventIds && productId) {
        await setProductEvents({
          productId: productId,
          eventIds: data.eventIds.map((id) => id as Id<'events'>),
        });
      }
      navigate('/my-products');
    } catch (error) {
      console.error('Failed to save product:', error);
      toast.error(t('form.saveFailed'), {
        description: getUserFacingErrorMessage(error),
      });
    }
  };

  const handleDelete = async () => {
    await deleteProduct({ id: productId as Id<'products'> });
    navigate('/my-products');
  };

  if (isEditing && product === undefined) {
    return <div>{t('form.loading')}</div>;
  }
  if (isEditing && product === null) {
    return <div>{t('form.notFound')}</div>;
  }

  return (
    <div>
      <div className="container mx-auto">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-6 max-w-5xl mx-auto">
            <BackButton variant="ghost" title={t('actions.cancel', { ns: 'common' })} />
          </div>
          <div className="mb-8">
            <h1 className="text-4xl mb-2">
              {isEditing ? t('form.editTitle') : t('form.newTitle')}
            </h1>
            <p className="text-muted-foreground">{t('form.subtitle')}</p>
          </div>

          {isLocked && (
            <Alert variant="warning" className="mb-6">
              <Lock className="h-4 w-4" />
              <AlertDescription>{t('form.lockedHint')}</AlertDescription>
            </Alert>
          )}

          <FormProvider {...methods}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <MyProductBasicInfo />

              <MyProductEditImages
                existingImageUrls={existingImageUrls}
                setExistingImageIds={setExistingImageIds}
                existingImageIds={existingImageIds}
              />

              <MyProductSelectEvents />

              <div className="flex gap-4">
                <Button
                  type="submit"
                  size="lg"
                  className="flex-2"
                  disabled={isSubmitting || !currentUser || isLocked}
                >
                  {isEditing ? t('form.saveChanges') : t('form.create')}
                </Button>
                {productId && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="flex-1" disabled={!canDelete}>
                        <Trash2 className="h-4 w-4" />
                        {t('form.delete')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('form.confirmTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('form.confirmDelete')}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>
                          {t('actions.cancel', { ns: 'common' })}
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>
                          {t('form.deleteAction')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </form>
          </FormProvider>
        </div>
      </div>
    </div>
  );
}
