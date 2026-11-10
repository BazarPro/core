import { PageHeader } from '../../../components/ui/page-header';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../../components/ui/button';

import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useApiClient, useMutation, useQuery } from '../../../lib/api/react';
import { api } from '../../../lib/api/functions';
import type { Doc, Id } from '../../../lib/api/types';
import { useForm, FormProvider, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MyProductBasicInfo } from './components/MyProductBasicInfo';
import { MyProductEditImages } from './components/MyProductEditImages';
import { MyProductSelectEvents } from './components/MyProductSelectEvents';
import { isPriceInRange, PRODUCT_CONDITIONS } from '../../../shared/constants';
import { missingForEvent, resolveEventFeatures } from '../../../shared/eventFeatures';
import { getCategoryFields } from '../../../shared/categoryFields';
import { uploadImages } from '../../../lib/uploadImages';
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
import { Copy, Lock, Plus, Trash2 } from 'lucide-react';
import { MyProductNegotiation } from './components/MyProductExtras';
import { zodMessage } from '../../../i18n/zodMessage';
import { BackButton } from '../../../components/navigation/BackButton';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { PageSkeleton } from '../../../components/ui/loading';
import { StickyActionBar } from '../../../components/ui/sticky-action-bar';

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
      price: z
        .number(zodMessage('form.priceRequired', 'seller'))
        .min(0, t('form.priceNegative'))
        .refine(isPriceInRange, t('form.priceTooHigh')),
      readyForSale: z.boolean(),

      //to add product to events:
      eventIds: z.optional(z.array(z.string())),
      ...productExtrasFields(),
    })
    .refine(isMinimumPriceBelowPrice, minimumPriceError());
}

type ProductFormData = z.infer<ReturnType<typeof buildProductSchema>>;

/** Values a copy of another item starts from. */
function prefillOf(
  source: Pick<
    Doc<'products'>,
    'title' | 'description' | 'condition' | 'productCategory' | 'price'
  > &
    Parameters<typeof productExtrasDefaults>[0]
): Partial<ProductFormData> {
  return {
    title: source.title,
    description: source.description,
    condition: source.condition,
    categoryId: source.productCategory,
    price: source.price,
    ...productExtrasDefaults(source),
  };
}

export function ProductForm() {
  const { t } = useTranslation('seller');
  const productSchema = useMemo(() => buildProductSchema(t), [t]);
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const productId = params.productId as Id<'products'> | undefined;

  const currentUser = useQuery(api.users.viewer);
  const registeredEvents = useQuery(api.events.getMyRegisteredEvents, { includePast: true });
  const categoryList = useQuery(api.categories.getAllCategories);
  const fixedData = useQuery(
    api.eventProducts.getFixedItemData,
    productId ? { productId: productId as Id<'products'> } : 'skip'
  );
  const isLocked = useQuery(
    api.eventProducts.isProductLockedForSeller,
    productId ? { productId } : 'skip'
  );
  const canDelete =
    useQuery(api.products.canDeleteProduct, productId ? { productId } : 'skip') ?? !isLocked;

  const addProduct = useMutation(api.products.addProduct);
  const updateProduct = useMutation(api.products.updateProduct);
  const setProductEvents = useMutation(api.eventProducts.setProductEvents);
  const client = useApiClient();
  const generateUploadUrl = useMutation(api.products.generateUploadUrl);
  const deleteProduct = useMutation(api.products.deleteProduct);

  const isEditing = !!productId;
  // "Add a similar item": the form starts as a copy, photos included
  const copyFrom =
    (!isEditing && (location.state?.copyFrom as Id<'products'> | undefined)) || undefined;
  const copySource = useQuery(api.products.getProduct, copyFrom ? { productId: copyFrom } : 'skip');
  const copyEventIds = useQuery(
    api.eventProducts.getEventIdsForProduct,
    copyFrom ? { productId: copyFrom } : 'skip'
  );
  const [showNegotiation, setShowNegotiation] = useState(false);

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
  const [imageUploadKey, setImageUploadKey] = useState(0);

  const methods = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      title: '',
      description: '',
      condition: undefined,
      categoryId: '',
      price: undefined as unknown as number,
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
    formState: { isSubmitting, isDirty },
  } = methods;

  const selectedEventIds = useWatch({ control: methods.control, name: 'eventIds' }) ?? [];
  const chosenEvents = (registeredEvents ?? []).filter((event) =>
    selectedEventIds.includes(event._id)
  );
  // Photos are optional unless a chosen event requires one
  const eventsRequiringPhoto = chosenEvents.filter((event) =>
    missingForEvent({ images: [] }, event).includes('photo')
  );
  // Category fields a chosen event requires, e.g. the frame number
  const requiredFields = [
    ...new Set(chosenEvents.flatMap((event) => resolveEventFeatures(event).requiredFields ?? [])),
  ];

  // Live updates fill the form, but never over what the user is typing
  useEffect(() => {
    if (product && productEventIds !== undefined && !isDirty) {
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
  }, [product, productEventIds, isDirty, reset]);

  // The copy fills the form once its item and bazaars are loaded; past bazaars stay out
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copyFrom || copied || !copySource || copyEventIds === undefined || !registeredEvents) {
      return;
    }
    const now = Date.now();
    const upcoming = new Set(
      registeredEvents.filter((event) => event.endDate >= now).map((event) => event._id as string)
    );
    reset({
      ...methods.getValues(),
      ...prefillOf(copySource),
      imageFiles: [],
      eventIds: copyEventIds.filter((id) => upcoming.has(id)),
    });
    setExistingImageIds(copySource.images);
    setCopied(true);
  }, [copyFrom, copied, copySource, copyEventIds, registeredEvents, reset, methods]);

  const copyImageUrls = useQuery(
    api.products.getImageUrls,
    copySource && copySource.images.length > 0 ? { storageIds: copySource.images } : 'skip'
  );
  useEffect(() => {
    if (copyImageUrls) setExistingImageUrls(copyImageUrls.filter(Boolean) as string[]);
  }, [copyImageUrls]);

  useEffect(() => {
    if (existingImageUrlsQuery) {
      setExistingImageUrls(existingImageUrlsQuery.filter(Boolean) as string[]);
    }
  }, [existingImageUrlsQuery]);

  const onSubmit = async (data: ProductFormData, createAnother = false) => {
    if (!currentUser) return;
    if (isEditing && product?.isLocked) {
      toast.error(t('form.locked'));
      return;
    }

    const incomingImagesCount = data.imageFiles?.length ?? 0;
    if (eventsRequiringPhoto.length > 0 && existingImageIds.length + incomingImagesCount === 0) {
      setError('imageFiles', {
        type: 'manual',
        message: t('form.imageRequiredFor', {
          events: eventsRequiringPhoto.map((event) => event.title).join(', '),
        }),
      });
      return;
    }
    clearErrors('imageFiles');

    const categoryFields = getCategoryFields(data.categoryId, categoryList);
    const missingField = categoryFields.find(
      (field) => requiredFields.includes(field.key) && !data.attributes?.[field.key]?.trim()
    );
    if (missingField) {
      const events = chosenEvents
        .filter((event) => resolveEventFeatures(event).requiredFields?.includes(missingField.key))
        .map((event) => event.title)
        .join(', ');
      setError(`attributes.${missingField.key}` as never, {
        type: 'manual',
        message: t('form.fieldRequiredFor', { events }),
      });
      return;
    }

    if (!data.condition) {
      setError('condition', {
        type: 'manual',
        message: t('form.conditionRequired'),
      });
      return;
    }
    clearErrors('condition');
    const { condition } = data;

    const newImageStorageIds = await uploadImages(client, data.imageFiles ?? [], generateUploadUrl);
    const finalImageIds = [...existingImageIds, ...newImageStorageIds];
    const shouldStartOnboardingAfterCreate = !isEditing && Boolean(location.state?.initialEventId);

    try {
      if (isEditing && productId) {
        const saveProduct = () =>
          updateProduct({
            productId,
            title: data.title,
            description: data.description,
            condition,
            productCategory: data.categoryId as Id<'categories'>,
            images: finalImageIds,
            price: data.price,
            readyForSale: true,
            ...productExtrasPayload(data),
          });
        const saveEvents = () =>
          setProductEvents({
            productId,
            eventIds: (data.eventIds ?? []).map((id) => id as Id<'events'>),
          });
        // The server checks photos against the events: a new photo has to be saved before
        // announcing, leaving an event that requires photos before removing the last one.
        if (finalImageIds.length === 0) {
          await saveEvents();
          await saveProduct();
        } else {
          await saveProduct();
          await saveEvents();
        }
        toast.success(t('form.updated'));
      } else {
        const newProductId = await addProduct({
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
        if (data.eventIds && data.eventIds.length > 0) {
          await setProductEvents({
            productId: newProductId,
            eventIds: data.eventIds.map((id) => id as Id<'events'>),
          });
        }
        toast.success(
          createAnother ? t('form.createdNext', { title: data.title }) : t('form.created')
        );
        if (shouldStartOnboardingAfterCreate) {
          setParticipantOnboardingPending();
        }

        if (createAnother) {
          // Keep bazaar (eventIds) and category (categoryId) for the next item;
          // reset title, price, description, images, extras.
          reset({
            title: '',
            description: '',
            condition: data.condition,
            categoryId: data.categoryId,
            price: undefined as unknown as number,
            imageFiles: [],
            readyForSale: true,
            eventIds: data.eventIds ?? [],
            ...productExtrasDefaults(),
          });
          setExistingImageIds([]);
          setExistingImageUrls([]);
          setImageUploadKey((k) => k + 1);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          methods.setFocus('title');
          return;
        }
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

  if ((isEditing && product === undefined) || (copyFrom && copySource === undefined)) {
    return <PageSkeleton variant="form" className="max-w-2xl" />;
  }
  if (isEditing && product === null) {
    return <div>{t('form.notFound')}</div>;
  }

  // Negotiating only matters at bazaars that offer it; elsewhere it waits behind a button
  const negotiationOffered = chosenEvents.some((event) => {
    const features = resolveEventFeatures(event);
    return features.priceOffers || features.minimumPrice;
  });
  const negotiationSet =
    methods.getValues('acceptsOffers') || methods.getValues('minimumPrice') !== undefined;
  const negotiation =
    negotiationOffered || negotiationSet || showNegotiation ? (
      <MyProductNegotiation />
    ) : (
      <button
        type="button"
        onClick={() => setShowNegotiation(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <Plus className="h-4 w-4" />
        {t('form.negotiable')}
      </button>
    );

  const disabled = isSubmitting || !currentUser || !!isLocked;

  return (
    <div>
      <div className="container mx-auto">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-6 max-w-5xl mx-auto">
            <BackButton variant="ghost" title={t('actions.cancel', { ns: 'common' })} />
          </div>
          <PageHeader
            title={isEditing ? t('form.editTitle') : t('form.newTitle')}
            className="mb-8"
          />

          {isLocked && (
            <Alert variant="warning" className="mb-6">
              <Lock className="h-4 w-4" />
              <AlertDescription>{t('form.lockedHint')}</AlertDescription>
            </Alert>
          )}

          {copySource && (
            <Alert className="mb-6">
              <Copy className="h-4 w-4" />
              <AlertDescription>{t('form.copyOf', { title: copySource.title })}</AlertDescription>
            </Alert>
          )}

          <FormProvider {...methods}>
            <form onSubmit={handleSubmit((data) => onSubmit(data, false))} className="space-y-6">
              {fixedData?.fixed && (
                <Alert>
                  <Lock className="h-4 w-4" />
                  <AlertDescription>{t('form.fixedHint')}</AlertDescription>
                </Alert>
              )}
              <MyProductBasicInfo
                requiredFields={requiredFields}
                fixedFields={fixedData?.fixed ? fixedData.fieldKeys : undefined}
                negotiation={negotiation}
              />

              <MyProductEditImages
                key={imageUploadKey}
                existingImageUrls={existingImageUrls}
                setExistingImageIds={setExistingImageIds}
                existingImageIds={existingImageIds}
                eventsRequiringPhoto={eventsRequiringPhoto.map((event) => event.title)}
              />

              <div className="bg-card rounded-xl border p-5 sm:p-6">
                <MyProductSelectEvents />
              </div>

              <StickyActionBar>
                <Button type="submit" size="lg" className="flex-1" disabled={disabled}>
                  {isEditing ? t('form.saveChanges') : t('form.create')}
                </Button>
                {!isEditing && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="flex-1"
                    disabled={disabled}
                    onClick={handleSubmit((data) => onSubmit(data, true))}
                  >
                    {t('form.createAndNext')}
                  </Button>
                )}
                {productId && (
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" className="text-destructive" disabled={!canDelete}>
                        <Trash2 className="h-4 w-4" />
                        {t('form.delete')}
                      </Button>
                    }
                    title={t('form.confirmTitle')}
                    description={t('form.confirmDelete')}
                    confirmLabel={t('form.deleteAction')}
                    onConfirm={handleDelete}
                    destructive
                  />
                )}
              </StickyActionBar>
            </form>
          </FormProvider>
        </div>
      </div>
    </div>
  );
}
