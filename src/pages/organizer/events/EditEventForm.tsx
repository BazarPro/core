import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '../../../components/ui/button';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { LABEL_FORMATS } from '../../../../convex/constants';
import { EditEventBasicInfo } from './components/EditEventBasicInfo';
import { EditEventCategories } from './components/EditEventCategories';
import { EditEventContact } from './components/EditEventContact';
import { EditEventAccess } from './components/EditEventAccess';
import { EditEventMapSection } from './components/EditEventMapSection';
import { EditEventFeatures } from './components/EditEventFeatures';
import { EditEventSellerInfo } from './components/EditEventSellerInfo';
import { logisticsFromForm } from '../../../lib/sellerLogistics';
import {
  MAX_DISCOUNT_PERCENT,
  resolveEventFeatures,
  type StoredEventFeatures,
} from '../../../../convex/eventFeatures';
import {
  EVENT_SERVICES,
  EVENT_VISIBILITY,
  type EventServices,
  type EventVisibility,
} from '../../../../convex/constants';
import { useFeatureFlags } from '../../../hooks/useFeatureFlags';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { toast } from 'sonner';
import { getUserFacingErrorMessage } from '../../../lib/errors';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { zodMessage } from '../../../i18n/zodMessage';

/**
 * @param getOriginalStartDate start date of the event being edited (datetime-local string);
 *   an unchanged start date is not checked against "tomorrow", so running events can be saved.
 */
const buildEventSchema = (getOriginalStartDate: () => string | undefined) =>
  z
    .object({
      title: z.string().min(3, zodMessage('form.titleShort', 'organizer')),
      description: z.string().min(10, zodMessage('form.descriptionShort', 'organizer')),
      location: z.string().min(1, zodMessage('form.locationRequired', 'organizer')),
      startDate: z
        .string()
        .refine(
          (val) => new Date(val).toString() !== 'Invalid Date',
          zodMessage('form.invalidStart', 'organizer')
        )
        .refine(
          (val) => {
            if (val === getOriginalStartDate()) return true;
            const d = new Date(val);
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);
            return d >= tomorrow;
          },
          zodMessage('form.startInFuture', 'organizer')
        ),
      endDate: z
        .string()
        .refine(
          (val) => new Date(val).toString() !== 'Invalid Date',
          zodMessage('form.invalidEnd', 'organizer')
        ),
      categories: z.array(z.string()).min(1, zodMessage('form.categoryRequired', 'organizer')),
      services: z.array(z.enum(EVENT_SERVICES)),
      contactInfo: z.string().min(1, zodMessage('form.contactRequired', 'organizer')),
      commission: z.number().min(0).max(100),
      visibility: z.enum(EVENT_VISIBILITY),
      accessCode: z.string().optional(),
      vendorLimit: z.number().optional().or(z.nan()),
      coverImageFile: z.any().optional(),
      removeCoverImage: z.boolean().optional(),
      eventMapImageFile: z.any().optional(),
      removeEventMapImage: z.boolean().optional(),
      features: z.object({
        discounts: z.boolean(),
        discountStartsAt: z.string().optional(),
        maxDiscountPercent: z
          .number(zodMessage('form.maxDiscountRequired', 'organizer'))
          .min(1, zodMessage('form.minPercent', 'organizer'))
          .max(
            MAX_DISCOUNT_PERCENT,
            zodMessage('form.maxPercent', 'organizer', { max: MAX_DISCOUNT_PERCENT })
          ),
        priceOffers: z.boolean(),
        minimumPrice: z.boolean(),
        questions: z.boolean(),
        photosOptional: z.boolean(),
        maxItemsPerSeller: z
          .number()
          .int(zodMessage('form.wholeNumber', 'organizer'))
          .min(1, zodMessage('form.minOne', 'organizer'))
          .optional()
          .or(z.nan()),
        labelFormat: z.enum(LABEL_FORMATS),
        priceOnLabel: z.boolean(),
        intakeFee: z
          .number()
          .min(0, zodMessage('form.feeNegative', 'organizer'))
          .max(100, zodMessage('form.feeMax', 'organizer'))
          .optional()
          .or(z.nan()),
      }),
      sellerLogistics: z.object({
        dropoffStart: z.string(),
        dropoffEnd: z.string(),
        pickupStart: z.string(),
        pickupEnd: z.string(),
        note: z.string().max(2000, zodMessage('form.noteMax', 'organizer')),
      }),
    })
    .refine((data) => new Date(data.endDate) > new Date(data.startDate), {
      ...zodMessage('form.endAfterStart', 'organizer'),
      path: ['endDate'],
    })
    .refine(
      (data) => {
        const from = data.features.discountStartsAt;
        if (!data.features.discounts || !from) return true;
        const time = new Date(from).getTime();
        return (
          time >= new Date(data.startDate).getTime() && time <= new Date(data.endDate).getTime()
        );
      },
      {
        ...zodMessage('form.discountInEvent', 'organizer'),
        path: ['features', 'discountStartsAt'],
      }
    );

type EventFormData = z.infer<ReturnType<typeof buildEventSchema>>;
type FeatureFormData = EventFormData['features'];

function featuresToForm(stored: StoredEventFeatures | undefined): FeatureFormData {
  const features = resolveEventFeatures({ features: stored });
  return {
    discounts: features.discounts,
    discountStartsAt: features.discountStartsAt
      ? formatForDateTimeLocal(features.discountStartsAt)
      : '',
    maxDiscountPercent: features.maxDiscountPercent,
    priceOffers: features.priceOffers,
    minimumPrice: features.minimumPrice,
    questions: features.questions,
    photosOptional: features.photosOptional,
    maxItemsPerSeller: features.maxItemsPerSeller,
    labelFormat: features.labelFormat,
    priceOnLabel: features.priceOnLabel,
    intakeFee: features.intakeFee,
  };
}

function featuresFromForm(features: FeatureFormData): StoredEventFeatures {
  return {
    discounts: features.discounts,
    discountStartsAt:
      features.discounts && features.discountStartsAt
        ? new Date(features.discountStartsAt).getTime()
        : undefined,
    maxDiscountPercent: features.maxDiscountPercent,
    priceOffers: features.priceOffers,
    minimumPrice: features.minimumPrice,
    questions: features.questions,
    photosOptional: features.photosOptional,
    maxItemsPerSeller:
      typeof features.maxItemsPerSeller === 'number' && !isNaN(features.maxItemsPerSeller)
        ? features.maxItemsPerSeller
        : undefined,
    labelFormat: features.labelFormat,
    priceOnLabel: features.priceOnLabel,
    intakeFee:
      typeof features.intakeFee === 'number' && !isNaN(features.intakeFee) && features.intakeFee > 0
        ? features.intakeFee
        : undefined,
  };
}

type LogisticsFormData = EventFormData['sellerLogistics'];
type StoredLogistics = NonNullable<Doc<'events'>['sellerLogistics']>;

function logisticsToForm(stored: StoredLogistics | undefined, withTimes = true): LogisticsFormData {
  const time = (value?: number) =>
    withTimes && value !== undefined ? formatForDateTimeLocal(value) : '';
  return {
    dropoffStart: time(stored?.dropoffStart),
    dropoffEnd: time(stored?.dropoffEnd),
    pickupStart: time(stored?.pickupStart),
    pickupEnd: time(stored?.pickupEnd),
    note: stored?.note ?? '',
  };
}

/** Renders a timestamp as local time for datetime-local inputs. */
function formatForDateTimeLocal(timestamp: number): string {
  const d = new Date(timestamp);
  const offset = d.getTimezoneOffset();
  const localtime = new Date(timestamp - offset * 60 * 1000);
  return localtime.toISOString().slice(0, 16);
}

export function EditEventForm() {
  const { t } = useTranslation('organizer');
  const navigate = useNavigate();
  const createEvent = useMutation(api.events.createEvent);
  const generateUploadUrl = useMutation(api.products.generateUploadUrl);
  const { isEventCreationEnabled } = useFeatureFlags();

  const params = useParams();
  const eventId = params.eventId as Id<'events'> | undefined;
  const isEditing = !!eventId;

  const editEvent = useMutation(api.events.editEvent);
  const createLocationCategory = useMutation(api.eventLocationCategories.createCategory);
  const event = useQuery(api.events.getEvent, eventId ? { id: eventId! } : 'skip');
  const [pendingLocationCategories, setPendingLocationCategories] = useState<string[]>([]);

  const categories = useQuery(api.categories.getAllCategories);
  const pastEvents = useQuery(api.events.getMyEvents, !isEditing ? { includePast: true } : 'skip');

  const originalStartDate = useRef<string | undefined>(undefined);
  originalStartDate.current = event ? formatForDateTimeLocal(event.startDate) : undefined;
  const eventSchema = useMemo(() => buildEventSchema(() => originalStartDate.current), []);
  const now = Date.now();
  const isRunning = !!event && event.startDate <= now && now <= event.endDate;

  const methods = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    mode: 'onTouched',
    defaultValues: {
      title: event ? event.title : '',
      description: event ? event.description : '',
      location: event ? event.location : '',
      startDate: event ? formatForDateTimeLocal(event.startDate) : '',
      endDate: event ? formatForDateTimeLocal(event.endDate) : '',
      categories: event ? event.categories : [],
      services: event ? (event.services as EventServices[]) : [EVENT_SERVICES[0]],
      contactInfo: event ? event.contactInfo : '',
      commission: event ? event.commission : 15,
      visibility: event ? (event.visibility as EventVisibility) : EVENT_VISIBILITY[0],
      accessCode: event ? event.accessCode : '',
      vendorLimit: event ? event.vendorLimit : undefined,
      coverImageFile: undefined,
      removeCoverImage: false,
      eventMapImageFile: undefined,
      removeEventMapImage: false,
      features: featuresToForm(event?.features),
      sellerLogistics: logisticsToForm(event?.sellerLogistics),
    },
  });

  const {
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = methods;

  useEffect(() => {
    if (!event || !isEditing) return;

    reset({
      title: event.title,
      description: event.description,
      location: event.location,
      startDate: formatForDateTimeLocal(event.startDate),
      endDate: formatForDateTimeLocal(event.endDate),
      categories: event.categories,
      services: event.services as EventServices[],
      contactInfo: event.contactInfo,
      commission: event.commission,
      visibility: event.visibility as EventVisibility,
      accessCode: event.accessCode || '',
      vendorLimit: event.vendorLimit,
      coverImageFile: undefined,
      removeCoverImage: false,
      eventMapImageFile: undefined,
      removeEventMapImage: false,
      features: featuresToForm(event.features),
      sellerLogistics: logisticsToForm(event.sellerLogistics),
    });
  }, [event, isEditing, reset]);

  const handleTemplateSelect = (templateId: string) => {
    const template = pastEvents?.find((e) => e._id === templateId);
    if (template) {
      reset({
        title: template.title,
        description: template.description,
        location: template.location,
        startDate: '',
        endDate: '',
        categories: template.categories,
        services: template.services as EventServices[],
        contactInfo: template.contactInfo,
        commission: template.commission,
        visibility: template.visibility as EventVisibility,
        accessCode: template.accessCode || '',
        vendorLimit: template.vendorLimit,
        coverImageFile: undefined,
        removeCoverImage: false,
        // The discount start time belongs to the old date, so it is not copied
        features: { ...featuresToForm(template.features), discountStartsAt: '' },
        // Times belong to the old date; the note for sellers is worth keeping
        sellerLogistics: logisticsToForm(template.sellerLogistics, false),
      });
      toast.info(t('form.templateApplied'));
    }
  };

  const onSubmit = async (data: EventFormData) => {
    if (!isEventCreationEnabled && !isEditing) return;

    try {
      let coverImage: Id<'_storage'> | undefined = undefined;
      if (data.coverImageFile instanceof File) {
        const postUrl = await generateUploadUrl();
        const result = await fetch(postUrl, {
          method: 'POST',
          headers: { 'Content-Type': data.coverImageFile.type },
          body: data.coverImageFile,
        });
        const { storageId } = await result.json();
        coverImage = storageId;
      }

      let eventMapImage: Id<'_storage'> | undefined = undefined;
      if (data.eventMapImageFile instanceof File) {
        const postUrl = await generateUploadUrl();
        const result = await fetch(postUrl, {
          method: 'POST',
          headers: { 'Content-Type': data.eventMapImageFile.type },
          body: data.eventMapImageFile,
        });
        const { storageId } = await result.json();
        eventMapImage = storageId;
      }

      if (isEditing && eventId) {
        const editPayload: {
          id: Id<'events'>;
          title: string;
          description: string;
          location: string;
          startDate: number;
          endDate: number;
          contactInfo: string;
          commission: number;
          visibility: EventVisibility;
          categories: Id<'categories'>[];
          services: EventServices[];
          accessCode?: string;
          vendorLimit?: number;
          coverImage?: Id<'_storage'>;
          eventMapImage?: Id<'_storage'>;
          clearCoverImage?: boolean;
          clearEventMapImage?: boolean;
          features: StoredEventFeatures;
          sellerLogistics: StoredLogistics;
        } = {
          id: eventId,
          title: data.title,
          description: data.description,
          location: data.location,
          startDate: new Date(data.startDate).getTime(),
          endDate: new Date(data.endDate).getTime(),
          contactInfo: data.contactInfo,
          commission: data.commission,
          visibility: data.visibility,
          categories: data.categories as Id<'categories'>[],
          services: data.services,
          accessCode: data.accessCode || undefined,
          vendorLimit:
            typeof data.vendorLimit === 'number' && !isNaN(data.vendorLimit)
              ? data.vendorLimit
              : undefined,
          features: featuresFromForm(data.features),
          sellerLogistics: logisticsFromForm(data.sellerLogistics),
        };

        if (coverImage) {
          editPayload.coverImage = coverImage;
        }
        if (!coverImage && data.removeCoverImage) {
          editPayload.clearCoverImage = true;
        }
        if (eventMapImage) {
          editPayload.eventMapImage = eventMapImage;
        }
        if (!eventMapImage && data.removeEventMapImage) {
          editPayload.clearEventMapImage = true;
        }

        await editEvent(editPayload);
        toast.success(t('form.updated'));

        navigate('/events/view/' + eventId);
      } else {
        const newEventId = await createEvent({
          title: data.title,
          description: data.description,
          location: data.location,
          startDate: new Date(data.startDate).getTime(),
          endDate: new Date(data.endDate).getTime(),
          contactInfo: data.contactInfo,
          commission: data.commission,
          visibility: data.visibility,
          categories: data.categories as Id<'categories'>[],
          services: data.services,
          accessCode: data.accessCode || undefined,
          vendorLimit:
            typeof data.vendorLimit === 'number' && !isNaN(data.vendorLimit)
              ? data.vendorLimit
              : undefined,
          coverImage,
          eventMapImage,
          features: featuresFromForm(data.features),
          sellerLogistics: logisticsFromForm(data.sellerLogistics),
        });
        for (const label of pendingLocationCategories) {
          const trimmed = label.trim();
          if (trimmed) {
            await createLocationCategory({ eventId: newEventId, label: trimmed });
          }
        }
        setPendingLocationCategories([]);
        toast.success(t('form.created'));
        navigate('/my-events');
      }
    } catch (error) {
      console.error('Failed to create/edit event:', error);
      toast.error(t('form.saveFailed'), {
        description: getUserFacingErrorMessage(error),
      });
    }
  };

  if (isEditing && event === undefined) {
    return <div>{t('form.loading')}</div>;
  }
  if (!categories) {
    return <div>{t('form.loading')}</div>;
  }
  if (isEditing && event === null) {
    return <div>{t('form.notFound')}</div>;
  }

  return (
    <div>
      <div className="container mx-auto">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl mb-2">
              {isEditing ? t('form.editTitle') : t('form.newTitle')}
            </h1>
          </div>

          {!isEditing && pastEvents && pastEvents.length > 0 && (
            <div className="mb-8 p-4 bg-muted/30 rounded-lg border border-dashed flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Copy className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="font-medium">{t('form.template')}</div>
                  <div className="text-xs text-muted-foreground">{t('form.templateHint')}</div>
                </div>
              </div>
              <Select onValueChange={handleTemplateSelect}>
                <SelectTrigger className="w-full sm:w-[250px] bg-background">
                  <SelectValue placeholder={t('form.chooseTemplate')} />
                </SelectTrigger>
                <SelectContent>
                  {pastEvents.map((e) => (
                    <SelectItem key={e._id} value={e._id}>
                      {e.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!isEventCreationEnabled && !isEditing && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{t('form.creationDisabled')}</AlertDescription>
            </Alert>
          )}

          <FormProvider {...methods}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
              <fieldset disabled={!isEventCreationEnabled && !isEditing} className="space-y-8">
                {isRunning && (
                  <Alert>
                    <AlertDescription>{t('form.running')}</AlertDescription>
                  </Alert>
                )}
                <EditEventBasicInfo
                  initialCoverImageUrl={event?.coverImageUrl}
                  lockDates={isRunning}
                />
                <EditEventMapSection
                  eventId={isEditing ? eventId : undefined}
                  initialEventMapUrl={event?.eventMapImageUrl}
                  pendingLocationCategories={pendingLocationCategories}
                  onPendingLocationCategoriesChange={setPendingLocationCategories}
                />
                <EditEventCategories categoryList={categories} />
                <EditEventContact lockCommission={isRunning} />
                <EditEventAccess lockVisibility={isRunning} />
                <EditEventSellerInfo />
                <EditEventFeatures />
              </fieldset>

              <div className="flex gap-4">
                <Button
                  type="submit"
                  size="lg"
                  className="flex-1"
                  disabled={isSubmitting || (!isEventCreationEnabled && !isEditing)}
                >
                  {isSubmitting
                    ? t('form.creating')
                    : isEditing
                      ? t('form.save')
                      : t('form.create')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => navigate(isEditing ? '/events/view/' + eventId : '/my-events')}
                  disabled={isSubmitting}
                >
                  {t('actions.cancel', { ns: 'common' })}
                </Button>
              </div>
            </form>
          </FormProvider>
        </div>
      </div>
    </div>
  );
}
