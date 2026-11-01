import { useEffect, useMemo, useRef, useState } from 'react';
import { get, useForm, FormProvider, useFormContext } from 'react-hook-form';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { useApiClient, useAuthState, useMutation, useQuery } from '../../../lib/api/react';
import { api } from '../../../lib/api/functions';
import type { Doc, Id } from '../../../lib/api/types';
import { LABEL_FORMATS } from '../../../shared/constants';
import { EditEventBasicInfo } from './components/EditEventBasicInfo';
import { EditEventCategories } from './components/EditEventCategories';
import { EditEventContact } from './components/EditEventContact';
import { EditEventAccess } from './components/EditEventAccess';
import { EditEventMapSection } from './components/EditEventMapSection';
import { DiscountStartField, EditEventFeatures } from './components/EditEventFeatures';
import { EditEventSellerInfo } from './components/EditEventSellerInfo';
import { logisticsFromForm } from '../../../lib/sellerLogistics';
import {
  MAX_DISCOUNT_PERCENT,
  resolveEventFeatures,
  type StoredEventFeatures,
} from '../../../shared/eventFeatures';
import {
  EVENT_COUNTRIES,
  EVENT_SERVICES,
  EVENT_VISIBILITY,
  POSTAL_CODE_PATTERNS,
  type EventServices,
  type EventVisibility,
} from '../../../shared/constants';
import { useFeatureFlags } from '../../../hooks/useFeatureFlags';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { toast } from 'sonner';
import { getUserFacingErrorMessage } from '../../../lib/errors';
import { formatPriceDE } from '../../../lib/utils';
import { selectEvent } from '../../../lib/selectedEvent';
import {
  clearEventDraft,
  CREATE_DRAFT_PATH,
  loadEventDraft,
  saveEventDraft,
} from '../../../lib/eventDraft';

/** Fees and item limit sellers registered with; they may only get better for sellers. */
interface RegisteredTerms {
  commission: number;
  intakeFee: number;
  maxItemsPerSeller?: number;
}
import { useTranslation } from 'react-i18next';
import { coverFile, coverForKind, DEFAULT_COVER } from '../../../lib/eventCovers';
import { WizardPictures } from './components/wizard/WizardPictures';
import { zodMessage } from '../../../i18n/zodMessage';
import i18n from '../../../i18n';
import { EventTypePicker } from './components/EventTypePicker';
import { formatEventPlace, placeFromLocation, type EventPlace } from '../../../shared/eventJsonLd';
import {
  EVENT_TYPES,
  findEventType,
  type EventType,
  type EventTypeId,
} from '../../../lib/eventTypes';
import {
  EventPagePreview,
  FeesPreview,
  ItemsPreview,
  ListingPreview,
  LogisticsPreview,
  PlacePreview,
  SalePreview,
} from './components/wizard/WizardPreviews';
import { dateLocale } from '../../../i18n/format';
import { PageSkeleton } from '../../../components/ui/loading';

/**
 * @param getOriginalStartDate start date of the event being edited (datetime-local string);
 *   an unchanged start date is not checked against "tomorrow", so running events can be saved.
 * @param getRegisteredTerms set once sellers registered: fees may only go down, the limit up.
 */
const buildEventSchema = (
  getOriginalStartDate: () => string | undefined,
  getRegisteredTerms: () => RegisteredTerms | undefined
) =>
  z
    .object({
      title: z.string().min(3, zodMessage('form.titleShort', 'organizer')),
      description: z.string().min(10, zodMessage('form.descriptionShort', 'organizer')),
      location: z.string().min(1, zodMessage('form.locationRequired', 'organizer')),
      address: z
        .object({
          street: z.string().max(200, zodMessage('form.addressTooLong', 'organizer')),
          postalCode: z.string().trim(),
          city: z.string().max(100, zodMessage('form.addressTooLong', 'organizer')),
          country: z.enum(EVENT_COUNTRIES),
        })
        .refine(
          (address) =>
            !address.postalCode || POSTAL_CODE_PATTERNS[address.country].test(address.postalCode),
          { ...zodMessage('form.postalCodeInvalid', 'organizer'), path: ['postalCode'] }
        )
        .refine((address) => !address.postalCode || address.city.trim(), {
          ...zodMessage('form.cityRequired', 'organizer'),
          path: ['city'],
        }),
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
      coverTemplate: z.string().optional(),
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
        questionsDuringEventOnly: z.boolean(),
        photosOptional: z.boolean(),
        requiredFields: z.array(z.string()),
        maxItemsPerSeller: z
          .number()
          .int(zodMessage('form.wholeNumber', 'organizer'))
          .min(1, zodMessage('form.minOne', 'organizer'))
          .optional()
          .or(z.nan()),
        labelFormat: z.enum(LABEL_FORMATS),
        priceOnLabel: z.boolean(),
        privateSellersOnly: z.boolean(),
        fixedSellerData: z.boolean(),
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
        const start = new Date(data.startDate).getTime();
        const end = new Date(data.endDate).getTime();
        // Dates still open (or invalid): those fields report it, nothing to compare with yet
        if (Number.isNaN(start) || Number.isNaN(end)) return true;
        const time = new Date(from).getTime();
        return time >= start && time <= end;
      },
      {
        ...zodMessage('form.discountInEvent', 'organizer'),
        path: ['features', 'discountStartsAt'],
      }
    )
    .superRefine((data, ctx) => {
      const terms = getRegisteredTerms();
      if (!terms) return;
      const given = (value: number | undefined) =>
        typeof value === 'number' && !isNaN(value) ? value : undefined;
      if (data.commission > terms.commission) {
        ctx.addIssue({
          code: 'custom',
          message: i18n.t('form.registeredMaxCommission', {
            ns: 'organizer',
            percent: terms.commission,
          }),
          path: ['commission'],
        });
      }
      if ((given(data.features.intakeFee) ?? 0) > terms.intakeFee) {
        ctx.addIssue({
          code: 'custom',
          message: i18n.t('form.registeredMaxIntakeFee', {
            ns: 'organizer',
            fee: formatPriceDE(terms.intakeFee),
          }),
          path: ['features', 'intakeFee'],
        });
      }
      const limit = given(data.features.maxItemsPerSeller) ?? Infinity;
      if (terms.maxItemsPerSeller !== undefined && limit < terms.maxItemsPerSeller) {
        ctx.addIssue({
          code: 'custom',
          message: i18n.t('form.registeredMinItems', {
            ns: 'organizer',
            min: terms.maxItemsPerSeller,
          }),
          path: ['features', 'maxItemsPerSeller'],
        });
      }
    });

type EventFormData = z.infer<ReturnType<typeof buildEventSchema>>;
type FeatureFormData = EventFormData['features'];
/** What a draft keeps: everything but own pictures, which cannot wait in the browser */
type DraftValues = Omit<
  EventFormData,
  'coverImageFile' | 'eventMapImageFile' | 'removeCoverImage' | 'removeEventMapImage'
>;

function draftValues(data: EventFormData): DraftValues {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- left out on purpose
  const { coverImageFile, eventMapImageFile, removeCoverImage, removeEventMapImage, ...rest } =
    data;
  return rest;
}

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
    questionsDuringEventOnly: features.questionsDuringEventOnly,
    photosOptional: features.photosOptional,
    requiredFields: features.requiredFields ?? [],
    maxItemsPerSeller: features.maxItemsPerSeller,
    labelFormat: features.labelFormat,
    priceOnLabel: features.priceOnLabel,
    intakeFee: features.intakeFee,
    privateSellersOnly: features.privateSellersOnly,
    fixedSellerData: features.fixedSellerData,
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
    questionsDuringEventOnly: features.questions && features.questionsDuringEventOnly,
    photosOptional: features.photosOptional,
    requiredFields: features.requiredFields,
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
    privateSellersOnly: features.privateSellersOnly,
    fixedSellerData: features.fixedSellerData,
  };
}

type AddressFormData = EventFormData['address'];

/** The address fields; older events only have the location, their address is read from it. */
function addressToForm(event: EventPlace | null | undefined): AddressFormData {
  const empty: AddressFormData = { street: '', postalCode: '', city: '', country: 'DE' };
  if (!event) return empty;
  if (event.street || event.postalCode || event.city) {
    const country = EVENT_COUNTRIES.find((code) => code === event.country) ?? 'DE';
    return {
      street: event.street ?? '',
      postalCode: event.postalCode ?? '',
      city: event.city ?? '',
      country,
    };
  }
  // Read only German addresses from the text: four digits could be any of the others
  const { address } = placeFromLocation(event.location);
  if (typeof address === 'string') return empty;
  return {
    street: address.streetAddress ?? '',
    postalCode: address.postalCode ?? '',
    city: address.addressLocality ?? '',
    country: 'DE',
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

/**
 * Steps of the creation wizard and the form fields each one checks before moving on. Only
 * the fields shown in that step: an error elsewhere could not be seen, let alone fixed.
 */
const WIZARD_STEPS = [
  { id: 'type', fields: [] },
  // What makes the bazaar first, with a preview of each choice
  { id: 'sale', fields: ['features.maxDiscountPercent'] },
  { id: 'items', fields: ['categories', 'features.maxItemsPerSeller'] },
  { id: 'fees', fields: ['commission', 'features.intakeFee'] },
  { id: 'registration', fields: ['visibility', 'accessCode', 'vendorLimit'] },
  // The exact details at the end
  {
    id: 'basics',
    fields: [
      'title',
      'description',
      'location',
      'address',
      'startDate',
      'endDate',
      'features.discountStartsAt',
      'contactInfo',
    ],
  },
  { id: 'logistics', fields: ['sellerLogistics'] },
  { id: 'preview', fields: [] },
] as const;
type WizardStepId = (typeof WIZARD_STEPS)[number]['id'];

function WizardHeader({ step, onGoTo }: { step: number; onGoTo: (step: number) => void }) {
  const { t } = useTranslation('organizer');
  const id = WIZARD_STEPS[step].id;
  return (
    <div className="space-y-3">
      <ol className="flex gap-1">
        {WIZARD_STEPS.map((candidate, index) => (
          <li key={candidate.id} className="flex-1">
            {/* Done steps can be opened again; later ones only with "next", which checks */}
            <button
              type="button"
              onClick={() => onGoTo(index)}
              disabled={index >= step}
              aria-current={index === step ? 'step' : undefined}
              className="group w-full text-left disabled:cursor-default"
            >
              <span
                className={`block h-1.5 rounded-full transition-colors ${index <= step ? 'bg-primary' : 'bg-muted'} group-enabled:group-hover:bg-primary/70`}
              />
              <span
                className={`mt-1.5 hidden truncate text-xs lg:block ${index === step ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
              >
                {t(`wizard.short.${candidate.id}`)}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted-foreground">
        {t('wizard.progress', { step: step + 1, total: WIZARD_STEPS.length })}
      </p>
      <h2 className="text-2xl font-semibold">{t(`wizard.steps.${id}.title`)}</h2>
      <p className="text-muted-foreground">{t(`wizard.steps.${id}.text`)}</p>
    </div>
  );
}

/** Last step: the bazaar page as visitors will see it, and the key facts. */
function WizardFinal({ type }: { type?: EventType }) {
  const { t } = useTranslation('organizer');
  const { watch } = useFormContext<EventFormData>();
  const values = watch();
  const start = values.startDate ? new Date(values.startDate) : undefined;
  return (
    <div className="space-y-6">
      <EventPagePreview
        type={type}
        conditions={{
          commission: Number.isFinite(values.commission) ? values.commission : 0,
          features: featuresFromForm(values.features),
          sellerLogistics: logisticsFromForm(values.sellerLogistics),
        }}
      />
      <dl className="grid gap-3 rounded-lg border bg-card p-6 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">{t('wizard.summary.title')}</dt>
          <dd className="font-medium">{values.title || '–'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('wizard.summary.when')}</dt>
          <dd className="font-medium">
            {start && !isNaN(start.getTime())
              ? start.toLocaleString(dateLocale(), { dateStyle: 'full', timeStyle: 'short' })
              : '–'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('wizard.summary.where')}</dt>
          <dd className="font-medium">
            {values.location
              ? formatEventPlace({ ...values.address, location: values.location })
              : '–'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('wizard.summary.categories')}</dt>
          <dd className="font-medium">{values.categories.length}</dd>
        </div>
      </dl>
    </div>
  );
}

/** The preview next to a step; the type and final steps show theirs full width. */
function StepPreview({ id, type }: { id: WizardStepId; type?: EventType }) {
  switch (id) {
    case 'sale':
      return <SalePreview type={type} />;
    case 'items':
      return <ItemsPreview type={type} />;
    case 'fees':
      return <FeesPreview type={type} />;
    case 'registration':
      return <ListingPreview type={type} />;
    case 'basics':
      return <PlacePreview type={type} />;
    case 'logistics':
      return <LogisticsPreview />;
    default:
      return null;
  }
}

export function EditEventForm() {
  const { t } = useTranslation('organizer');
  const navigate = useNavigate();
  const createEvent = useMutation(api.events.createEvent);
  const client = useApiClient();
  const generateUploadUrl = useMutation(api.products.generateUploadUrl);
  const { isEventCreationEnabled } = useFeatureFlags();

  const params = useParams();
  const eventId = params.eventId as Id<'events'> | undefined;
  const isEditing = !!eventId;
  const [searchParams, setSearchParams] = useSearchParams();
  // Visitors try the wizard without an account; it is needed only to create the bazaar
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthState();
  const isGuest = !isEditing && !isAuthLoading && !isAuthenticated;

  const editEvent = useMutation(api.events.editEvent);
  const createLocationCategory = useMutation(api.eventLocationCategories.createCategory);
  const event = useQuery(api.events.getEvent, eventId ? { id: eventId! } : 'skip');
  const [pendingLocationCategories, setPendingLocationCategories] = useState<string[]>([]);

  const categories = useQuery(api.categories.getAllCategories);
  const pastEvents = useQuery(
    api.events.getMyEvents,
    !isEditing && isAuthenticated ? { includePast: true } : 'skip'
  );

  const now = Date.now();
  const isRunning = !!event && event.startDate <= now && now <= event.endDate;
  // Sellers registered with these fees: they may only go down, the item limit only up
  const feeLockState = useQuery(api.events.getFeeLock, eventId ? { eventId } : 'skip');
  const feeLock = isRunning ? 'running' : feeLockState?.locked ? 'sellers' : null;

  const originalStartDate = useRef<string | undefined>(undefined);
  originalStartDate.current = event ? formatForDateTimeLocal(event.startDate) : undefined;
  const registeredTerms = useRef<RegisteredTerms | undefined>(undefined);
  registeredTerms.current =
    event && feeLock
      ? {
          commission: event.commission,
          intakeFee: event.features?.intakeFee ?? 0,
          maxItemsPerSeller: event.features?.maxItemsPerSeller,
        }
      : undefined;
  const eventSchema = useMemo(
    () =>
      buildEventSchema(
        () => originalStartDate.current,
        () => registeredTerms.current
      ),
    []
  );

  const methods = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    mode: 'onTouched',
    defaultValues: {
      title: event ? event.title : '',
      description: event ? event.description : '',
      location: event ? event.location : '',
      address: addressToForm(event),
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
      coverTemplate: eventId ? undefined : DEFAULT_COVER,
      eventMapImageFile: undefined,
      removeEventMapImage: false,
      features: featuresToForm(event?.features),
      sellerLogistics: logisticsToForm(event?.sellerLogistics),
    },
  });

  const {
    handleSubmit,
    reset,
    formState: { isSubmitting, isDirty },
  } = methods;

  // Live updates fill the form, but never over what the user is typing
  useEffect(() => {
    if (!event || !isEditing || isDirty) return;

    reset({
      title: event.title,
      description: event.description,
      location: event.location,
      address: addressToForm(event),
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
  }, [event, isEditing, isDirty, reset]);

  const handleTemplateSelect = (templateId: string) => {
    const template = pastEvents?.find((e) => e._id === templateId);
    if (template) {
      reset({
        title: template.title,
        description: template.description,
        location: template.location,
        address: addressToForm(template),
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
        coverTemplate: DEFAULT_COVER,
        // The discount start time belongs to the old date, so it is not copied
        features: { ...featuresToForm(template.features), discountStartsAt: '' },
        // Times belong to the old date; the note for sellers is worth keeping
        sellerLogistics: logisticsToForm(template.sellerLogistics, false),
      });
      toast.info(t('form.templateApplied'));
      setEventType(undefined);
      setStep(1);
    }
  };

  // Creating goes through a wizard that explains each group of settings
  const [step, setStep] = useState(0);
  // Every new step starts at the top: after it rendered, so a shorter step cannot stop
  // the scrolling half way (on phones the buttons sit far below the start)
  const shownStep = useRef(step);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);
  const [eventType, setEventType] = useState<EventTypeId>();
  const chosenType = findEventType(eventType);
  const stepId = WIZARD_STEPS[step].id;
  // Settings and their preview side by side; the first and the last step are previews
  const sideBySide = stepId !== 'type' && stepId !== 'preview';
  const applyEventType = (id: EventTypeId) => {
    const type = EVENT_TYPES.find((candidate) => candidate.id === id);
    if (!type) return;
    const current = methods.getValues();
    const matching = (categories ?? [])
      .filter((category) => type.categoryMatch?.test(category.label))
      .map((category) => category._id as string);
    reset({
      ...current,
      // A start for the title; the organizer adds town or year in "When and where?"
      title: current.title.trim() ? current.title : t(`eventTypes.${type.id}.exampleTitle`),
      coverTemplate: current.coverImageFile ? undefined : coverForKind(type.item),
      commission: type.commission,
      categories: matching.length > 0 ? matching : current.categories,
      features: featuresToForm(type.features),
    });
    setEventType(id);
    setStep(1);
  };
  // An invalid field of an earlier step would stay hidden: go back to that step
  const showFirstInvalidStep = (errors: Record<string, unknown>) => {
    const index = WIZARD_STEPS.findIndex((candidate) =>
      candidate.fields.some((field) => get(errors, field))
    );
    if (index >= 0) setStep(index);
    toast.error(t('wizard.fixErrors'));
  };
  const keepDraft = () =>
    saveEventDraft<DraftValues>({
      values: draftValues(methods.getValues()),
      pendingLocationCategories,
      eventType,
    });
  const goToStep = async (next: number) => {
    if (next > step) {
      const fields = WIZARD_STEPS[step].fields;
      if (fields.length > 0 && !(await methods.trigger(fields as never))) return;
    }
    if (isGuest) keepDraft();
    setStep(next);
  };

  // Own pictures need an account: back here after the login, the draft is still there
  const loginForPictures = () => {
    keepDraft();
    navigate(`/login?redirect=${encodeURIComponent('/events/new')}`);
  };

  // Last step without an account: keep the bazaar and create it right after the sign-up
  const onGuestSubmit = () => {
    keepDraft();
    navigate(`/register?redirect=${encodeURIComponent(CREATE_DRAFT_PATH)}`);
  };

  // A waiting draft comes back once the form is ready; after the sign-up it is created
  const draftHandled = useRef(false);
  const [creatingDraft, setCreatingDraft] = useState(false);
  useEffect(() => {
    if (isEditing || isAuthLoading || !categories || draftHandled.current) return;
    draftHandled.current = true;
    const draft = loadEventDraft<DraftValues>();
    if (!draft) {
      // From the landing page: start with the kind of bazaar the visitor picked there
      const type = findEventType(searchParams.get('type') ?? undefined);
      if (type) {
        searchParams.delete('type');
        setSearchParams(searchParams, { replace: true });
        applyEventType(type.id);
      }
      return;
    }
    reset({ ...methods.getValues(), ...draft.values });
    setPendingLocationCategories(draft.pendingLocationCategories);
    setEventType(findEventType(draft.eventType)?.id);
    setStep(WIZARD_STEPS.length - 1);
    if (isAuthenticated && searchParams.get('draft') === '1') {
      searchParams.delete('draft');
      setSearchParams(searchParams, { replace: true });
      setCreatingDraft(true);
    } else {
      toast.info(t('wizard.draftRestored'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when auth and categories are known
  }, [isEditing, isAuthLoading, categories, isAuthenticated]);
  // Next render: onSubmit then sees the restored storage locations
  useEffect(() => {
    if (!creatingDraft) return;
    void handleSubmit(onSubmit, showFirstInvalidStep)().finally(() => setCreatingDraft(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per restored draft
  }, [creatingDraft]);

  const onSubmit = async (data: EventFormData) => {
    if (!isEventCreationEnabled && !isEditing) return;

    try {
      let coverImage: Id<'_storage'> | undefined = undefined;
      if (data.coverImageFile instanceof File) {
        coverImage = await client.upload(await generateUploadUrl(), data.coverImageFile);
      } else if (!isEditing && data.coverTemplate) {
        // Only a picture: the bazaar is created without it if it cannot be loaded
        try {
          coverImage = await client.upload(
            await generateUploadUrl(),
            await coverFile(data.coverTemplate)
          );
        } catch (error) {
          console.error('Failed to use the cover template:', error);
        }
      }

      let eventMapImage: Id<'_storage'> | undefined = undefined;
      if (data.eventMapImageFile instanceof File) {
        eventMapImage = await client.upload(await generateUploadUrl(), data.eventMapImageFile);
      }

      if (isEditing && eventId) {
        const editPayload: {
          id: Id<'events'>;
          title: string;
          description: string;
          location: string;
          address: AddressFormData;
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
          address: data.address,
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
          address: data.address,
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
        clearEventDraft();
        toast.success(t('form.created'));
        // The new event becomes the chosen one right away, not only once its page renders:
        // whoever goes straight back to the overview finds it there
        selectEvent(newEventId);
        navigate(`/events/view/${newEventId}`);
      }
    } catch (error) {
      console.error('Failed to create/edit event:', error);
      toast.error(t('form.saveFailed'), {
        description: getUserFacingErrorMessage(error),
      });
    }
  };

  if (isEditing && event === null) {
    return <div>{t('form.notFound')}</div>;
  }
  if ((isEditing && event === undefined) || !categories || isAuthLoading || creatingDraft) {
    return <PageSkeleton variant="form" className="max-w-3xl" />;
  }

  return (
    <div>
      <div className="container mx-auto">
        <div className={isEditing ? 'max-w-3xl mx-auto' : 'max-w-6xl mx-auto'}>
          <div className="mb-8">
            <h1 className="text-4xl mb-2">
              {isEditing ? t('form.editTitle') : t('form.newTitle')}
            </h1>
          </div>

          {isGuest && (
            <Alert className="mb-6 border-primary/40 bg-primary/5">
              <AlertDescription>
                <span className="block font-semibold text-foreground">
                  {t('wizard.guestTitle')}
                </span>
                {t('wizard.guestText')}
              </AlertDescription>
            </Alert>
          )}

          {!isEventCreationEnabled && !isEditing && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{t('form.creationDisabled')}</AlertDescription>
            </Alert>
          )}

          <FormProvider {...methods}>
            {isEditing ? (
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
                  <EditEventContact feeLock={feeLock} />
                  <EditEventAccess lockVisibility={isRunning} />
                  <EditEventSellerInfo />
                  <EditEventFeatures feeLock={feeLock} />
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
                    onClick={() => navigate(isEditing ? '/events/view/' + eventId : '/')}
                    disabled={isSubmitting}
                  >
                    {t('actions.cancel', { ns: 'common' })}
                  </Button>
                </div>
              </form>
            ) : (
              <form
                onSubmit={(e) => {
                  // Enter in a field of an earlier step moves on instead of creating the event
                  if (step < WIZARD_STEPS.length - 1) {
                    e.preventDefault();
                    void goToStep(step + 1);
                    return;
                  }
                  void handleSubmit(isGuest ? onGuestSubmit : onSubmit, showFirstInvalidStep)(e);
                }}
                className="space-y-6"
              >
                <WizardHeader step={step} onGoTo={(index) => void goToStep(index)} />
                <div
                  className={
                    sideBySide
                      ? 'grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]'
                      : undefined
                  }
                >
                  <fieldset disabled={!isEventCreationEnabled} className="min-w-0 space-y-8">
                    {sideBySide && (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full lg:hidden"
                        onClick={() =>
                          document
                            .getElementById('wizard-preview')
                            ?.scrollIntoView({ behavior: 'smooth' })
                        }
                      >
                        <Eye className="h-4 w-4" />
                        {t('wizard.preview.jump')}
                      </Button>
                    )}
                    {stepId === 'type' && (
                      <EventTypePicker
                        selected={eventType}
                        onPick={applyEventType}
                        pastEvents={pastEvents}
                        onCopy={handleTemplateSelect}
                      />
                    )}
                    {stepId === 'sale' && (
                      <EditEventFeatures
                        parts={['sale']}
                        showHeader={false}
                        withDiscountStart={false}
                      />
                    )}
                    {stepId === 'items' && (
                      <>
                        <EditEventCategories categoryList={categories} />
                        <EditEventFeatures parts={['items']} showHeader={false} />
                      </>
                    )}
                    {stepId === 'fees' && (
                      <>
                        <EditEventContact parts={['commission']} />
                        <EditEventFeatures parts={['fees']} showHeader={false} />
                      </>
                    )}
                    {stepId === 'registration' && (
                      <>
                        <EditEventAccess />
                        <EditEventFeatures parts={['registration']} showHeader={false} />
                      </>
                    )}
                    {stepId === 'basics' && (
                      <>
                        <EditEventBasicInfo
                          allowCoverImage={false}
                          afterDates={
                            methods.watch('features.discounts') ? <DiscountStartField /> : undefined
                          }
                        />
                        <EditEventContact parts={['contact']} />
                        <EditEventMapSection
                          allowMapImage={false}
                          pendingLocationCategories={pendingLocationCategories}
                          onPendingLocationCategoriesChange={setPendingLocationCategories}
                        />
                      </>
                    )}
                    {stepId === 'logistics' && <EditEventSellerInfo />}
                    {stepId === 'preview' && (
                      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
                        <div className="min-w-0 lg:order-2">
                          <WizardPictures
                            isGuest={isGuest}
                            onLogin={loginForPictures}
                            kind={chosenType?.item}
                          />
                        </div>
                        <div className="min-w-0 lg:order-1">
                          <WizardFinal type={chosenType} />
                        </div>
                      </div>
                    )}
                  </fieldset>
                  {sideBySide && (
                    <div id="wizard-preview" className="scroll-mt-20 lg:sticky lg:top-24">
                      <StepPreview id={stepId} type={chosenType} />
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-3">
                  {step > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={() => goToStep(step - 1)}
                      disabled={isSubmitting}
                    >
                      {t('wizard.back')}
                    </Button>
                  )}
                  {/*
                    Separate keys: reusing the same element would turn the clicked "next"
                    button into the submit button, and the browser would then submit
                  */}
                  {step < WIZARD_STEPS.length - 1 ? (
                    <Button
                      key="next"
                      type="button"
                      size="lg"
                      className="flex-1"
                      onClick={() => goToStep(step + 1)}
                    >
                      {step === 0 ? t('wizard.withoutType') : t('wizard.next')}
                    </Button>
                  ) : (
                    <Button
                      loading={isSubmitting}
                      key="create"
                      type="submit"
                      size="lg"
                      className="flex-1"
                      disabled={isSubmitting || !isEventCreationEnabled}
                    >
                      {isSubmitting
                        ? t('form.creating')
                        : isGuest
                          ? t('wizard.guestCreate')
                          : t('form.create')}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="lg"
                    onClick={() => navigate('/')}
                    disabled={isSubmitting}
                  >
                    {t('actions.cancel', { ns: 'common' })}
                  </Button>
                </div>
              </form>
            )}
          </FormProvider>
        </div>
      </div>
    </div>
  );
}
