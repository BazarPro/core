import { PageHeader } from '../../../components/ui/page-header';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { get, useForm, FormProvider, useFormContext } from 'react-hook-form';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, Bookmark, ChevronDown, Eye, FilePen, X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { StickyActionBar } from '../../../components/ui/sticky-action-bar';
import { Tabs, TabsContent } from '../../../components/ui/tabs';
import { isSettingsTab, SETTINGS_TABS, type SettingsTab, useSettingsTab } from './settingsTabs';
import { SettingsTabsList } from './SettingsTabsList';
import { useApiClient, useAuthState, useMutation, useQuery } from '../../../lib/api/react';
import { api } from '../../../lib/api/functions';
import type { Doc, Id } from '../../../lib/api/types';
import { LABEL_FORMATS, LABEL_MARKS } from '../../../shared/constants';
import { EditEventBasicInfo } from './components/EditEventBasicInfo';
import { EditEventCategories } from './components/EditEventCategories';
import { EditEventContact } from './components/EditEventContact';
import { EditEventAccess } from './components/EditEventAccess';
import { EditEventMapSection } from './components/EditEventMapSection';
import { EditEventFeatures } from './components/EditEventFeatures';
import { FormSection, FORM_ROWS } from '../../../components/ui/form-section';
import { followEventDates, type EventTimes } from '../../../lib/eventDates';
import { EditEventSellerInfo } from './components/EditEventSellerInfo';
import { logisticsFromForm } from '../../../lib/sellerLogistics';
import type { FeeLock } from '../../../lib/sellerFees';
import {
  MAX_DISCOUNT_PERCENT,
  resolveEventFeatures,
  type StoredEventFeatures,
} from '../../../shared/eventFeatures';
import {
  COUNTRIES,
  EVENT_VISIBILITY,
  POSTAL_CODE_PATTERNS,
  type EventVisibility,
} from '../../../shared/constants';
import { useFeatureFlags } from '../../../hooks/useFeatureFlags';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { toast } from 'sonner';
import { getUserFacingErrorMessage } from '../../../lib/errors';
import { cn, formatDateTimeDE, formatPrice } from '../../../lib/utils';
import { compactSelection, groupCategories } from '../../../shared/categoryTree';
import { selectEvent } from '../../../lib/selectedEvent';
import {
  clearEventDraft,
  CREATE_DRAFT_PATH,
  type EventDraft,
  eventDraftTitle,
  loadEventDraft,
  saveEventDraft,
  draftJson,
  withoutNulls,
} from '../../../lib/eventDraft';

/** Fees and item limit sellers registered with; they may only get better for sellers. */
interface RegisteredTerms {
  commission: number;
  intakeFee: number;
  maxItemsPerSeller?: number;
  /** Unset: no cap, the highest there is */
  maxFeesPerSeller?: number;
  /** Fee groups sellers registered with: they stay and only get cheaper (#302) */
  feeGroups: FeeGroup[];
}
import { useTranslation } from 'react-i18next';
import { coverFile, coverForKind, DEFAULT_COVER } from '../../../lib/eventCovers';
import { WizardPictures } from './components/wizard/WizardPictures';
import { zodMessage } from '../../../i18n/zodMessage';
import i18n from '../../../i18n';
import { EventTypePicker } from './components/EventTypePicker';
import { EditEventRegion } from './components/EditEventRegion';
import { placeFromLocation, type EventPlace } from '../../../shared/eventJsonLd';
import {
  EVENT_TYPES,
  findEventType,
  preselectedCategories,
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
import { WizardSummary } from './components/wizard/WizardSummary';
import { EditEventFeeGroups } from './components/EditEventFeeGroups';
import { MAX_FEE_GROUPS, extraHelperGroups, type FeeGroup } from '../../../shared/feeGroups';
import { PageSkeleton } from '../../../components/ui/loading';
import { isEventRunning } from '../../../shared/eventPhase';
import { compactRegion, regionSize } from '../../../shared/postalCodes';
import { postalCodesOf, regionImageChange } from '../../../lib/regionImage';

/**
 * @param getOriginalStartDate start date of the event being edited (datetime-local string);
 *   an unchanged start date is not checked against "tomorrow", so running events can be saved.
 * @param getRegisteredTerms set once sellers registered: fees may only go down, the limit up.
 * @param getIsAdmin the platform admin may set any start, also one in the past.
 */
const buildEventSchema = (
  getOriginalStartDate: () => string | undefined,
  getRegisteredTerms: () => RegisteredTerms | undefined,
  getIsAdmin: () => boolean = () => false
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
          country: z.enum(COUNTRIES),
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
            if (val === getOriginalStartDate() || getIsAdmin()) return true;
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
      services: z.array(z.string()),
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
        publicCatalog: z.boolean(),
        requiredFields: z.array(z.string()),
        maxItemsPerSeller: z
          .number()
          .int(zodMessage('form.wholeNumber', 'organizer'))
          .min(1, zodMessage('form.minOne', 'organizer'))
          .optional()
          .or(z.nan()),
        maxItemsTotal: z
          .number()
          .int(zodMessage('form.wholeNumber', 'organizer'))
          .min(1, zodMessage('form.minOne', 'organizer'))
          .optional()
          .or(z.nan()),
        labelFormat: z.enum(LABEL_FORMATS),
        priceOnLabel: z.boolean(),
        labelMark: z.enum(LABEL_MARKS),
        privateSellersOnly: z.boolean(),
        fixedSellerData: z.boolean(),
        directSale: z.boolean(),
        registrationOpen: z.boolean(),
        registrationStartsAt: z.string(),
        registrationEndsAt: z.string(),
        /** The kind of bazaar (#303); empty: none */
        eventType: z.string(),
        /** Only sellers from the region (#304); the prefixes stay while it is off */
        regionOnly: z.boolean(),
        /** Prefixes per country, e.g. { DE: ['89'], AT: ['6'] } */
        allowedPostalCodes: z.record(z.string(), z.array(z.string())),
        intakeFee: z
          .number()
          .min(0, zodMessage('form.feeNegative', 'organizer'))
          .max(100, zodMessage('form.feeMax', 'organizer'))
          .optional()
          .or(z.nan()),
        maxFeesPerSeller: z
          .number()
          .min(0, zodMessage('form.feeNegative', 'organizer'))
          .max(10_000, zodMessage('form.feeCapMax', 'organizer'))
          .optional()
          .or(z.nan()),
        feeGroups: z
          .array(
            z.object({
              id: z.string(),
              label: z
                .string()
                .trim()
                .min(1, zodMessage('feeGroups.labelRequired', 'organizer'))
                .max(60),
              commission: z
                .number(zodMessage('form.minPercent', 'organizer'))
                .min(0, zodMessage('form.feeNegative', 'organizer'))
                .max(100, zodMessage('form.maxPercent', 'organizer', { max: 100 })),
              intakeFee: z
                .number()
                .min(0, zodMessage('form.feeNegative', 'organizer'))
                .max(100, zodMessage('form.feeMax', 'organizer'))
                .optional()
                .or(z.nan()),
              maxFeesPerSeller: z
                .number()
                .min(0, zodMessage('form.feeNegative', 'organizer'))
                .max(10_000, zodMessage('form.feeCapMax', 'organizer'))
                .optional()
                .or(z.nan()),
              maxItemsPerSeller: z
                .number()
                .int(zodMessage('form.wholeNumber', 'organizer'))
                .min(1, zodMessage('form.minOne', 'organizer'))
                .optional()
                .or(z.nan()),
              assignment: z.enum(['selfDeclared', 'helpers', 'manual']),
              proofHint: z.string().max(200),
            })
          )
          .max(MAX_FEE_GROUPS)
          .superRefine((groups, ctx) => {
            const seen = new Set<string>();
            groups.forEach((group, index) => {
              const label = group.label.trim().toLowerCase();
              if (label && seen.has(label)) {
                ctx.addIssue({
                  code: 'custom',
                  message: i18n.t('feeGroups.labelTwice', { ns: 'organizer' }),
                  path: [index, 'label'],
                });
              }
              seen.add(label);
            });
            for (const index of extraHelperGroups(groups)) {
              ctx.addIssue({
                code: 'custom',
                message: i18n.t('feeGroups.helpersTwice', { ns: 'organizer' }),
                path: [index, 'assignment'],
              });
            }
          }),
      }),
      sellerLogistics: z.object({
        dropoffStart: z.string(),
        dropoffEnd: z.string(),
        pickupStart: z.string(),
        pickupEnd: z.string(),
        note: z.string().max(2000, zodMessage('form.noteMax', 'organizer')),
        // A window switched off keeps its times here, but they are not saved
        dropoffOff: z.boolean().optional(),
        pickupOff: z.boolean().optional(),
      }),
    })
    .refine((data) => new Date(data.endDate) > new Date(data.startDate), {
      ...zodMessage('form.endAfterStart', 'organizer'),
      path: ['endDate'],
    })
    .refine((data) => data.visibility !== 'approved' || !!data.accessCode?.trim(), {
      ...zodMessage('access.codeRequiredError', 'organizer'),
      path: ['accessCode'],
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
    .refine(
      ({ features: { registrationOpen, registrationStartsAt, registrationEndsAt } }) =>
        !registrationOpen ||
        !registrationStartsAt ||
        !registrationEndsAt ||
        new Date(registrationEndsAt) > new Date(registrationStartsAt),
      {
        ...zodMessage('features.registrationWindow', 'organizer'),
        path: ['features', 'registrationEndsAt'],
      }
    )
    .refine(
      ({ features: { regionOnly, allowedPostalCodes } }) =>
        !regionOnly || regionSize(allowedPostalCodes) > 0,
      {
        ...zodMessage('region.required', 'organizer'),
        path: ['features', 'allowedPostalCodes'],
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
            fee: formatPrice(terms.intakeFee),
          }),
          path: ['features', 'intakeFee'],
        });
      }
      const cap = given(data.features.maxFeesPerSeller) ?? Infinity;
      if (cap > (terms.maxFeesPerSeller ?? Infinity)) {
        ctx.addIssue({
          code: 'custom',
          message: i18n.t('form.registeredMaxFeeCap', {
            ns: 'organizer',
            fee: formatPrice(terms.maxFeesPerSeller ?? 0),
          }),
          path: ['features', 'maxFeesPerSeller'],
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
      // Fee groups sellers registered with stay (the form offers no removal) and only get
      // cheaper; an empty cap or item limit falls back to the bazaar's
      for (const before of terms.feeGroups) {
        const index = data.features.feeGroups.findIndex((group) => group.id === before.id);
        const now = data.features.feeGroups[index];
        if (!now) continue;
        const path = (field: string) => ['features', 'feeGroups', index, field];
        const tooHigh = (field: string, value: number, max: number, text: string) => {
          if (value > max) {
            ctx.addIssue({
              code: 'custom',
              message: i18n.t('feeGroups.registeredMax', { ns: 'organizer', value: text }),
              path: path(field),
            });
          }
        };
        tooHigh('commission', now.commission, before.commission, `${before.commission} %`);
        tooHigh(
          'intakeFee',
          given(now.intakeFee) ?? 0,
          before.intakeFee ?? 0,
          `${formatPrice(before.intakeFee ?? 0)} €`
        );
        const capBefore = before.maxFeesPerSeller ?? terms.maxFeesPerSeller;
        if (capBefore !== undefined) {
          tooHigh(
            'maxFeesPerSeller',
            given(now.maxFeesPerSeller) ?? given(data.features.maxFeesPerSeller) ?? Infinity,
            capBefore,
            `${formatPrice(capBefore)} €`
          );
        }
        const itemsBefore = before.maxItemsPerSeller ?? terms.maxItemsPerSeller;
        const items =
          given(now.maxItemsPerSeller) ?? given(data.features.maxItemsPerSeller) ?? Infinity;
        if (itemsBefore !== undefined && items < itemsBefore) {
          ctx.addIssue({
            code: 'custom',
            message: i18n.t('feeGroups.registeredMinItems', { ns: 'organizer', min: itemsBefore }),
            path: path('maxItemsPerSeller'),
          });
        }
      }
    });

type EventFormData = z.infer<ReturnType<typeof buildEventSchema>>;
type FeatureFormData = EventFormData['features'];
/** What a draft keeps: everything but own pictures, which cannot wait in the browser */
type DraftValues = Omit<
  EventFormData,
  | 'coverImageFile'
  | 'eventMapImageFile'
  | 'removeCoverImage'
  | 'removeEventMapImage'
  | 'coverTemplate'
> & { coverTemplate: EventFormData['coverTemplate'] | null };

function draftValues(data: EventFormData): DraftValues {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- left out on purpose
  const { coverImageFile, eventMapImageFile, removeCoverImage, removeEventMapImage, ...rest } =
    data;
  // null: JSON would drop undefined, and a removed cover would come back as the default
  return { ...rest, coverTemplate: rest.coverTemplate ?? null };
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
    publicCatalog: features.publicCatalog,
    requiredFields: features.requiredFields ?? [],
    maxItemsPerSeller: features.maxItemsPerSeller,
    maxItemsTotal: features.maxItemsTotal,
    labelFormat: features.labelFormat,
    priceOnLabel: features.priceOnLabel,
    labelMark: features.labelMark,
    intakeFee: features.intakeFee,
    maxFeesPerSeller: features.maxFeesPerSeller,
    feeGroups: (stored?.feeGroups ?? []).map((group) => ({
      ...group,
      intakeFee: group.intakeFee ?? NaN,
      maxFeesPerSeller: group.maxFeesPerSeller ?? NaN,
      maxItemsPerSeller: group.maxItemsPerSeller ?? NaN,
      proofHint: group.proofHint ?? '',
    })),
    privateSellersOnly: features.privateSellersOnly,
    fixedSellerData: features.fixedSellerData,
    directSale: features.directSale,
    registrationOpen: features.registrationOpen,
    registrationStartsAt: features.registrationStartsAt
      ? formatForDateTimeLocal(features.registrationStartsAt)
      : '',
    registrationEndsAt: features.registrationEndsAt
      ? formatForDateTimeLocal(features.registrationEndsAt)
      : '',
    eventType: findEventType(features.eventType)?.id ?? '',
    regionOnly: regionSize(features.allowedPostalCodes) > 0,
    allowedPostalCodes: features.allowedPostalCodes ?? {},
  };
}

/** A number field's value; an empty field is NaN or missing. */
function givenNumber(value: number | undefined): number | undefined {
  return typeof value === 'number' && !isNaN(value) ? value : undefined;
}

/**
 * The features as the create and edit mutations take them. The market-wide item limit and
 * the fee cap are sent as null when empty: the backend keeps a value that is left out, so
 * an older app that does not know them cannot delete them.
 */
type FeaturesArgs = Omit<
  StoredEventFeatures,
  'maxItemsTotal' | 'maxFeesPerSeller' | 'eventType'
> & {
  maxItemsTotal: number | null;
  maxFeesPerSeller: number | null;
  eventType: string | null;
};

function featuresFromForm(features: FeatureFormData): FeaturesArgs {
  return {
    discounts: features.discounts,
    discountStartsAt:
      features.discounts && features.discountStartsAt
        ? new Date(features.discountStartsAt).getTime()
        : undefined,
    maxDiscountPercent: features.maxDiscountPercent,
    // Offers and questions happen on the item page online
    priceOffers: features.publicCatalog && features.priceOffers,
    minimumPrice: features.minimumPrice,
    questions: features.publicCatalog && features.questions,
    questionsDuringEventOnly:
      features.publicCatalog && features.questions && features.questionsDuringEventOnly,
    photosOptional: features.photosOptional,
    publicCatalog: features.publicCatalog,
    requiredFields: features.requiredFields,
    maxItemsPerSeller: givenNumber(features.maxItemsPerSeller),
    maxItemsTotal: givenNumber(features.maxItemsTotal) ?? null,
    labelFormat: features.labelFormat,
    priceOnLabel: features.priceOnLabel,
    labelMark: features.labelMark,
    intakeFee:
      typeof features.intakeFee === 'number' && !isNaN(features.intakeFee) && features.intakeFee > 0
        ? features.intakeFee
        : undefined,
    // 0 is a cap as well: no fees at all
    maxFeesPerSeller: givenNumber(features.maxFeesPerSeller) ?? null,
    // Always sent: an empty list removes the groups
    feeGroups: features.feeGroups.map((group) => ({
      id: group.id,
      label: group.label.trim(),
      commission: group.commission,
      intakeFee: (givenNumber(group.intakeFee) ?? 0) > 0 ? group.intakeFee : undefined,
      maxFeesPerSeller: givenNumber(group.maxFeesPerSeller),
      maxItemsPerSeller: givenNumber(group.maxItemsPerSeller),
      assignment: group.assignment,
      proofHint: group.proofHint.trim() || undefined,
    })),
    privateSellersOnly: features.privateSellersOnly,
    fixedSellerData: features.fixedSellerData,
    directSale: features.directSale,
    // Sent in full: without a time the window is gone
    registrationOpen: features.registrationOpen,
    registrationStartsAt: timeFromForm(features.registrationOpen, features.registrationStartsAt),
    registrationEndsAt: timeFromForm(features.registrationOpen, features.registrationEndsAt),
    eventType: features.eventType || null,
    // Always sent: none lets everyone in again
    allowedPostalCodes: features.regionOnly ? compactRegion(features.allowedPostalCodes) : {},
  };
}

/** The features as stored, for previews: a cleared value is just not there. */
function storedFeatures({ maxItemsTotal, maxFeesPerSeller, eventType, ...rest }: FeaturesArgs) {
  return {
    ...rest,
    maxItemsTotal: maxItemsTotal ?? undefined,
    maxFeesPerSeller: maxFeesPerSeller ?? undefined,
    eventType: eventType ?? undefined,
  } satisfies StoredEventFeatures;
}

/** A datetime-local value as timestamp; nothing while its switch is off. */
function timeFromForm(enabled: boolean, value: string | undefined): number | undefined {
  return enabled && value ? new Date(value).getTime() : undefined;
}

type AddressFormData = EventFormData['address'];

/** The address fields; older events only have the location, their address is read from it. */
function addressToForm(event: EventPlace | null | undefined): AddressFormData {
  const empty: AddressFormData = { street: '', postalCode: '', city: '', country: 'DE' };
  if (!event) return empty;
  if (event.street || event.postalCode || event.city) {
    const country = COUNTRIES.find((code) => code === event.country) ?? 'DE';
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
    // Saved without times: the window was switched off
    dropoffOff: !!stored && withTimes && !stored.dropoffStart && !stored.dropoffEnd,
    pickupOff: !!stored && withTimes && !stored.pickupStart && !stored.pickupEnd,
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
 * The fields of each group of settings, checked before the wizard moves on. Only the
 * fields shown in that step: an error elsewhere could not be seen, let alone fixed.
 */
const SECTION_FIELDS = {
  basics: ['title', 'location', 'address', 'startDate', 'endDate'],
  sale: ['features.maxDiscountPercent', 'features.discountStartsAt'],
  items: ['categories', 'features.maxItemsPerSeller', 'features.maxItemsTotal'],
  fees: ['commission', 'features.intakeFee', 'features.maxFeesPerSeller', 'features.feeGroups'],
  registration: [
    'visibility',
    'accessCode',
    'vendorLimit',
    'features.registrationEndsAt',
    'features.allowedPostalCodes',
  ],
  logistics: ['sellerLogistics'],
  details: ['description', 'contactInfo'],
} as const;
type SectionKey = keyof typeof SECTION_FIELDS;

/**
 * Six steps for volunteers: related settings share a step. The first section of a step
 * leads, the others follow under their own heading (drop-off is folded, it is prefilled).
 */
const WIZARD_STEP_SECTIONS = [
  { id: 'type', sections: [] },
  // Date and place first: the times of discounts, registration and drop-off follow them
  { id: 'basics', sections: ['basics'] },
  // How and what is sold; drop-off follows the choice of a direct sale (setup and teardown)
  { id: 'items', sections: ['sale', 'items', 'logistics'] },
  { id: 'fees', sections: ['fees', 'registration'] },
  // The words for the bazaar page last, with the page growing next to them
  { id: 'details', sections: ['details'] },
  { id: 'preview', sections: [] },
] as const satisfies readonly { id: string; sections: readonly SectionKey[] }[];
const WIZARD_STEPS = WIZARD_STEP_SECTIONS.map((step) => ({
  ...step,
  fields: (step.sections as readonly SectionKey[]).flatMap((section) => SECTION_FIELDS[section]),
}));
/** The nine steps before they were merged (until 11/2026), for drafts that kept a number */
const OLD_STEP_IDS = [
  'type',
  'basics',
  'sale',
  'items',
  'fees',
  'registration',
  'logistics',
  'details',
  'preview',
];

/** Where a saved draft goes on: its step by name, else the old number, else the end. */
function draftStep(draft: { step?: number; stepId?: string }) {
  const byName = draft.stepId ? stepOfSection(draft.stepId) : -1;
  if (byName >= 0) return byName;
  if (draft.step === undefined) return WIZARD_STEPS.length - 1;
  const old = stepOfSection(OLD_STEP_IDS[draft.step] ?? '');
  return old >= 0 ? old : 1;
}

/** Steps with a name of their own */
const MERGED_STEPS = new Set<WizardStepId>(['items', 'fees']);

/** The step that shows a group of settings, e.g. for "edit" in the summary */
function stepOfSection(section: string) {
  return WIZARD_STEPS.findIndex(
    (step) => step.id === section || (step.sections as readonly string[]).includes(section)
  );
}
type WizardStepId = (typeof WIZARD_STEP_SECTIONS)[number]['id'];

function WizardHeader({
  step,
  onGoTo,
  onCancel,
  onContinueLater,
  savingLater,
  disabled,
  draftSavedAt,
  onDiscardDraft,
}: {
  step: number;
  onGoTo: (step: number) => void;
  onCancel: () => void;
  /** Signed in: keeps the bazaar in the account to finish later */
  onContinueLater?: () => void;
  savingLater?: boolean;
  disabled: boolean;
  /** A restored draft: when it was saved, and starting over instead */
  draftSavedAt?: number;
  onDiscardDraft?: () => void;
}) {
  const { t } = useTranslation('organizer');
  const directSale = useFormContext<EventFormData>().watch('features.directSale');
  const id = WIZARD_STEPS[step].id;
  const key = stepKey(id, directSale);
  // Steps that join two groups have their own name; the others use their group's
  const stepShort = (candidate: WizardStepId) =>
    MERGED_STEPS.has(candidate)
      ? t(`wizard.merged.${candidate}.short` as never)
      : t(`wizard.short.${stepKey(candidate, directSale)}`);
  const words = MERGED_STEPS.has(id) ? `wizard.merged.${id}` : `wizard.steps.${key}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h1 className="sr-only text-sm font-medium text-muted-foreground lg:not-sr-only">
          {t('form.newTitle')}
        </h1>
        <span className="whitespace-nowrap text-sm text-muted-foreground lg:hidden">
          {t('wizard.progress', { step: step + 1, total: WIZARD_STEPS.length })}
        </span>
        {/* A restored draft: a quiet note, starting over is one click on it */}
        {/* Phones: on a line of its own below the buttons, so nothing runs over the edge */}
        {draftSavedAt !== undefined && (
          <div className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
            <span
              data-testid="draft-restored"
              className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-tag-soft py-0.5 pl-2.5 pr-1 text-xs font-medium text-tag-soft-foreground"
            >
              <FilePen className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">
                {t('wizard.draftNote', { date: formatDateTimeDE(draftSavedAt) })}
              </span>
              {onDiscardDraft && (
                <button
                  type="button"
                  onClick={onDiscardDraft}
                  disabled={disabled}
                  className="shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 underline-offset-2 hover:bg-tag/30 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t('wizard.draftDiscard')}
                </button>
              )}
            </span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-1">
          {/* Up here, not in the bar at the bottom: on phones it would take a row of its own */}
          {onContinueLater && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onContinueLater}
              loading={savingLater}
              disabled={disabled || savingLater}
            >
              <Bookmark className="h-4 w-4" />
              {t('form.continueLater')}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={disabled}
            aria-label={t('actions.cancel', { ns: 'common' })}
          >
            <X className="h-4 w-4" />
            <span className={onContinueLater ? 'hidden sm:inline' : undefined}>
              {t('actions.cancel', { ns: 'common' })}
            </span>
          </Button>
        </div>
      </div>
      <ol className="flex gap-1">
        {WIZARD_STEPS.map((candidate, index) => (
          <li key={candidate.id} className="flex-1">
            {/* Done steps can be opened again; later ones only with "next", which checks */}
            <button
              type="button"
              onClick={() => onGoTo(index)}
              disabled={index >= step}
              aria-current={index === step ? 'step' : undefined}
              aria-label={stepShort(candidate.id)}
              className="group w-full text-left disabled:cursor-default"
            >
              <span
                className={`block h-1.5 rounded-full transition-colors ${index <= step ? 'bg-primary' : 'bg-border'} group-enabled:group-hover:bg-primary/70`}
              />
              <span
                className={`mt-1.5 hidden truncate text-xs lg:block ${index === step ? 'font-bold text-foreground' : index < step ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
              >
                {stepShort(candidate.id)}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{t(`${words}.title` as never)}</h2>
        <p className="mt-1 text-muted-foreground">{t(`${words}.text` as never)}</p>
      </div>
    </div>
  );
}

/**
 * The text key of a step or section: at a direct sale the logistics are setup and
 * teardown, not hand-in and pickup (#299).
 */
function stepKey<T extends string>(id: T, directSale: boolean | undefined) {
  return id === 'logistics' && directSale ? 'logisticsDirect' : id;
}

/** The fields of a tab of the settings; the basics there hold the description and contact too */
function editSectionFields(id: SettingsTab): readonly string[] {
  return id === 'basics'
    ? [...SECTION_FIELDS.basics, ...SECTION_FIELDS.details]
    : SECTION_FIELDS[id];
}

/**
 * A folded group of settings with a title and one line about it. Opens by itself when a
 * field in it is invalid, so a check never stops at something hidden.
 */
function Disclosure({
  title,
  hint,
  fields = [],
  defaultOpen = false,
  onUse,
  children,
}: {
  title: string;
  hint?: string;
  fields?: readonly string[];
  /** Open from the start, e.g. reached with "edit" from the summary */
  defaultOpen?: boolean;
  /** Opened or worked in, e.g. for the preview beside */
  onUse?: () => void;
  children: ReactNode;
}) {
  const { formState } = useFormContext();
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const invalid = fields.some((field) => get(formState.errors, field));
  // An error opens it and it stays open while being fixed: the field must not vanish
  useEffect(() => {
    if (invalid) setOpen(true);
  }, [invalid]);
  return (
    <section
      className="rounded-xl border bg-card shadow-xs"
      onFocusCapture={onUse}
      onPointerDownCapture={onUse}
    >
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          className="flex w-full items-center gap-3 rounded-xl px-5 py-4 text-left font-sans hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-6"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold">{title}</span>
            {hint && (
              <span className="block text-sm font-normal text-muted-foreground">{hint}</span>
            )}
          </span>
          <ChevronDown
            className={cn(
              'size-5 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180'
            )}
            aria-hidden
          />
        </button>
      </h3>
      {/*
        Always there, only hidden: the fields keep their state, and the button points to it.
        Cards inside lose their own frame: one box, the content in line with the title.
      */}
      <div
        id={id}
        hidden={!open}
        className="border-t [&>section]:rounded-none [&>section]:border-0 [&>section]:bg-transparent [&>section]:shadow-none"
      >
        {children}
      </div>
    </section>
  );
}

/** "Erweitert": settings most bazaars leave as they are */
function AdvancedDisclosure({
  fields,
  children,
}: {
  fields: readonly string[];
  children: ReactNode;
}) {
  const { t } = useTranslation('organizer');
  return (
    <Disclosure title={t('wizard.advanced')} hint={t('wizard.advancedHint')} fields={fields}>
      {children}
    </Disclosure>
  );
}

/** "details" exists only in the wizard; the edit page keeps them with the basics */
type EventSectionId = SettingsTab | 'details';

/**
 * One group of settings: the wizard shows them step by step, the edit page all at once.
 * Own pictures and locks exist only for an event that is already there (`editing`).
 */
function EventSection({
  id,
  categories,
  pendingLocationCategories,
  onPendingLocationCategoriesChange,
  editing,
}: {
  id: EventSectionId;
  categories: Doc<'categories'>[];
  pendingLocationCategories: string[];
  onPendingLocationCategoriesChange: (labels: string[]) => void;
  editing?: {
    eventId: Id<'events'>;
    coverImageUrl?: string | null;
    eventMapImageUrl?: string | null;
    isRunning: boolean;
    feeLock: FeeLock;
    /** Ids of the fee groups sellers registered with */
    registeredFeeGroups?: string[];
  };
}) {
  const feeLock = editing?.feeLock ?? null;
  const map = (
    <>
      <EditEventMapSection
        allowMapImage={!!editing}
        eventId={editing?.eventId}
        initialEventMapUrl={editing?.eventMapImageUrl ?? undefined}
        pendingLocationCategories={pendingLocationCategories}
        onPendingLocationCategoriesChange={onPendingLocationCategoriesChange}
      />
    </>
  );
  switch (id) {
    case 'basics':
      return editing ? (
        <>
          <EditEventBasicInfo
            initialCoverImageUrl={editing.coverImageUrl ?? undefined}
            lockDates={editing.isRunning}
          >
            <EditEventContact parts={['contact']} bare />
          </EditEventBasicInfo>
          {map}
        </>
      ) : (
        <EditEventBasicInfo allowCoverImage={false} parts={['when']} />
      );
    case 'details':
      return (
        // Two cards: with room between them
        <div className="space-y-4">
          <FormSection>
            <EditEventBasicInfo allowCoverImage={false} parts={['description']} />
            <EditEventContact parts={['contact']} bare />
          </FormSection>
          <EditEventMapSection
            allowMapImage={false}
            pendingLocationCategories={pendingLocationCategories}
            onPendingLocationCategoriesChange={onPendingLocationCategoriesChange}
          />
        </div>
      );
    case 'sale':
      return <EditEventFeatures parts={['sale']} showHeader={false} />;
    case 'items':
      return (
        <>
          <EditEventCategories categoryList={categories} />
          <EditEventFeatures parts={['items']} showHeader={false} feeLock={feeLock} />
        </>
      );
    case 'fees':
      return (
        <FormSection contentClassName="grid grid-cols-1 gap-5 space-y-0 sm:grid-cols-2">
          <EditEventContact parts={['commission']} feeLock={feeLock} bare />
          <EditEventFeatures
            parts={['fees']}
            showHeader={false}
            feeLock={feeLock}
            feeExampleKind={!!editing}
            advanced={editing ? 'include' : 'exclude'}
            bare
          />
          {editing ? (
            <EditEventFeeGroups feeLock={feeLock} registeredIds={editing.registeredFeeGroups} />
          ) : (
            // The cap and groups with their own fees are for experienced teams: folded
            <div className="sm:col-span-2">
              <AdvancedDisclosure fields={['features.maxFeesPerSeller', 'features.feeGroups']}>
                <div className="space-y-5 p-5 sm:p-6">
                  <div className="max-w-sm">
                    <EditEventFeatures parts={['fees']} showHeader={false} advanced="only" bare />
                  </div>
                  <EditEventFeeGroups feeLock={feeLock} />
                </div>
              </AdvancedDisclosure>
            </div>
          )}
        </FormSection>
      );
    case 'registration':
      return (
        <>
          <EditEventAccess lockVisibility={editing?.isRunning} />
          <FormSection contentClassName={FORM_ROWS}>
            <EditEventFeatures
              parts={['registration']}
              showHeader={false}
              advanced={editing ? 'include' : 'exclude'}
              bare
            />
            {editing ? (
              <EditEventRegion />
            ) : (
              // Private sellers, fixed data and postal codes: rarely needed, folded. A plain
              // wrapper: the row padding of FORM_ROWS goes around the box, not into it
              <div>
                <AdvancedDisclosure fields={['features.allowedPostalCodes']}>
                  <div className={cn(FORM_ROWS, 'p-5 sm:p-6')}>
                    <EditEventFeatures
                      parts={['registration']}
                      showHeader={false}
                      advanced="only"
                      bare
                    />
                    <EditEventRegion />
                  </div>
                </AdvancedDisclosure>
              </div>
            )}
          </FormSection>
        </>
      );
    case 'logistics':
      return <EditEventSellerInfo />;
  }
}

/** Last step: the bazaar page as visitors will see it. */
function WizardFinal({ type }: { type?: EventType }) {
  const { watch } = useFormContext<EventFormData>();
  const values = watch();
  return (
    <EventPagePreview
      type={type}
      conditions={{
        commission: Number.isFinite(values.commission) ? values.commission : 0,
        features: storedFeatures(featuresFromForm(values.features)),
        sellerLogistics: logisticsFromForm(values.sellerLogistics),
      }}
    />
  );
}

/**
 * The preview next to a step: the one of the group of settings in use (focused or
 * touched last). The type and final steps show theirs full width.
 */
function StepPreview({ id, type }: { id: string; type?: EventType }) {
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
    case 'details':
      return <PlacePreview type={type} withContact />;
    case 'logistics':
      return <LogisticsPreview />;
    default:
      return null;
  }
}

export function EditEventForm({
  headerAside,
  notice,
  dangerZone,
}: {
  /** Beside the title of the settings, e.g. the approval of the platform */
  headerAside?: ReactNode;
  /** Above the settings, e.g. why the platform rejected the bazaar */
  notice?: ReactNode;
  /** At the end of the settings, before the save bar: deleting the bazaar */
  dangerZone?: ReactNode;
} = {}) {
  const { t } = useTranslation('organizer');
  const navigate = useNavigate();
  const createEvent = useMutation(api.events.createEvent);
  const saveServerDraft = useMutation(api.events.saveEventDraft);
  const deleteServerDraft = useMutation(api.events.deleteEventDraft);
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
  const serverDraft = useQuery(
    api.events.getMyEventDraft,
    !isEditing && isAuthenticated ? {} : 'skip'
  );

  // The platform admin may change every setting, the locks below are for organizers
  const viewer = useQuery(api.users.viewer);
  const isAdmin = isEditing && viewer?.systemRole === 'admin';
  const isAdminRef = useRef(isAdmin);
  isAdminRef.current = isAdmin;
  const now = Date.now();
  const isRunning = !isAdmin && !!event && isEventRunning(event, now);
  // Sellers registered with these fees: they may only go down, the item limit only up
  const feeLockState = useQuery(api.events.getFeeLock, eventId ? { eventId } : 'skip');
  const feeLock = isAdmin ? null : isRunning ? 'running' : feeLockState?.locked ? 'sellers' : null;

  const originalStartDate = useRef<string | undefined>(undefined);
  originalStartDate.current = event ? formatForDateTimeLocal(event.startDate) : undefined;
  const registeredTerms = useRef<RegisteredTerms | undefined>(undefined);
  registeredTerms.current =
    event && feeLock
      ? {
          commission: event.commission,
          intakeFee: event.features?.intakeFee ?? 0,
          maxItemsPerSeller: event.features?.maxItemsPerSeller,
          maxFeesPerSeller: event.features?.maxFeesPerSeller,
          feeGroups: event.features?.feeGroups ?? [],
        }
      : undefined;
  const eventSchema = useMemo(
    () =>
      buildEventSchema(
        () => originalStartDate.current,
        () => registeredTerms.current,
        () => isAdminRef.current
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
      services: event ? event.services : [],
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
  const directSale = methods.watch('features.directSale');

  // While a bazaar is set up, drop-off, pickup and the other times around it follow its
  // date: picking the day suggests them on the same day, moving it moves them along
  const lastEventTimes = useRef<EventTimes>({ startDate: '', endDate: '' });
  useEffect(() => {
    if (isEditing) return;
    const values = methods.getValues();
    lastEventTimes.current = { startDate: values.startDate, endDate: values.endDate };
    const subscription = methods.watch((current, { name }) => {
      if (name !== 'startDate' && name !== 'endDate') {
        // A draft or template brings its own times: compare with those from now on
        if (name === undefined) {
          lastEventTimes.current = {
            startDate: current.startDate ?? '',
            endDate: current.endDate ?? '',
          };
        }
        return;
      }
      const next = { startDate: current.startDate ?? '', endDate: current.endDate ?? '' };
      const logistics = current.sellerLogistics ?? {};
      const features = current.features ?? {};
      const changes = followEventDates(lastEventTimes.current, next, {
        dropoffStart: logistics.dropoffStart ?? '',
        dropoffEnd: logistics.dropoffEnd ?? '',
        pickupStart: logistics.pickupStart ?? '',
        pickupEnd: logistics.pickupEnd ?? '',
        registrationEndsAt: features.registrationEndsAt ?? '',
        discountStartsAt: features.discountStartsAt ?? '',
      });
      if (!changes) return;
      lastEventTimes.current = next;
      for (const [key, value] of Object.entries(changes)) {
        const field =
          key === 'registrationEndsAt' || key === 'discountStartsAt'
            ? (`features.${key}` as const)
            : (`sellerLogistics.${key as 'dropoffStart'}` as const);
        methods.setValue(field, value, { shouldDirty: true });
      }
    });
    return () => subscription.unsubscribe();
  }, [isEditing, methods]);

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
      services: event.services,
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
        services: template.services,
        contactInfo: template.contactInfo,
        commission: template.commission,
        visibility: template.visibility as EventVisibility,
        accessCode: template.accessCode || '',
        vendorLimit: template.vendorLimit,
        coverImageFile: undefined,
        removeCoverImage: false,
        coverTemplate: DEFAULT_COVER,
        // Discount start and registration window belong to the old date: not copied
        features: {
          ...featuresToForm(template.features),
          discountStartsAt: '',
          registrationStartsAt: '',
          registrationEndsAt: '',
        },
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
  const stepRef = useRef(step);
  stepRef.current = step;
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
  // The group of settings in use, for the preview beside; a new step starts with its first
  const [active, setActive] = useState<{ step: number; section: string }>();
  const activeSection = active?.step === step ? active.section : undefined;
  const setActiveSection = (section: string) =>
    setActive((current) =>
      current?.step === step && current.section === section ? current : { step, section }
    );
  // Settings and their preview side by side; the first and the last step are previews
  const sideBySide = stepId !== 'type' && stepId !== 'preview';
  const applyEventType = (id: EventTypeId) => {
    const type = EVENT_TYPES.find((candidate) => candidate.id === id);
    if (!type) return;
    const current = methods.getValues();
    const matching = preselectedCategories(
      type,
      (categories ?? []).map((category) => ({ ...category, _id: category._id as string }))
    );
    reset({
      ...current,
      // A start for the title; the organizer adds town or year in "When and where?"
      title: current.title.trim() ? current.title : t(`eventTypes.${type.id}.exampleTitle`),
      coverTemplate: current.coverImageFile ? undefined : coverForKind(type.item),
      commission: type.commission,
      categories: matching.length > 0 ? matching : current.categories,
      // Kept with the bazaar: the conditions show an example that fits it (#303)
      features: featuresToForm({ ...type.features, eventType: type.id }),
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
  // The settings show one tab at a time (`?tab=` in the address, so a link can open one)
  const [activeTab, openTab] = useSettingsTab();
  // An error may sit in another tab: open the first one with an error
  const showFirstInvalidSection = (errors: Record<string, unknown>) => {
    const invalid = SETTINGS_TABS.find((section) =>
      editSectionFields(section).some((field) => get(errors, field))
    );
    if (invalid) openTab(invalid);
    toast.error(t('wizard.fixErrors'));
  };
  const [continuedDraftAt, setContinuedDraftAt] = useState<number>();
  const keepDraft = (draftStep: number, submitted = false) =>
    saveEventDraft<DraftValues>({
      values: draftValues(methods.getValues()),
      pendingLocationCategories,
      eventType,
      step: draftStep,
      stepId: WIZARD_STEPS[draftStep]?.id,
      submitted,
      continues: continuedDraftAt,
    });
  // Signed in, a bazaar can wait on the server with gaps; it comes back on the start
  // page (DashboardPage) and when the wizard opens again
  const [savingDraft, setSavingDraft] = useState(false);
  // There is only one saved draft: saving another bazaar over it asks first. That is the
  // case when the wizard did not continue it (e.g. started from the landing page) or it
  // changed elsewhere meanwhile.
  const [confirmReplace, setConfirmReplace] = useState(false);
  const replacesOtherDraft = !!serverDraft && serverDraft.updatedAt !== continuedDraftAt;
  const continueLater = async () => {
    setConfirmReplace(false);
    setSavingDraft(true);
    try {
      await saveServerDraft({
        // As JSON keeps them: empty numbers (NaN) would come back as null
        draft: draftJson({
          values: draftValues(methods.getValues()),
          pendingLocationCategories,
          eventType,
          step,
          savedAt: Date.now(),
        }),
      });
      clearEventDraft();
      toast.success(t('form.draftSaved'), { description: t('form.draftSavedHint') });
      navigate('/');
    } catch (error) {
      toast.error(t('form.draftSaveFailed'), { description: getUserFacingErrorMessage(error) });
    } finally {
      setSavingDraft(false);
    }
  };
  const goToStep = async (next: number) => {
    // Without a kind of bazaar nothing is chosen yet: every category is allowed, the
    // organizer only takes out what does not fit (an empty list would block the step)
    if (
      WIZARD_STEPS[step].id === 'type' &&
      next > step &&
      !methods.getValues('categories').length
    ) {
      const list = (categories ?? []).map((category) => ({
        ...category,
        _id: String(category._id),
      }));
      const everything = groupCategories(list).flatMap(({ category, children }) =>
        children.length ? children.map((child) => child._id) : [category._id]
      );
      methods.setValue('categories', compactSelection(new Set(everything), list));
    }
    if (next > step) {
      const fields = WIZARD_STEPS[step].fields;
      if (fields.length > 0 && !(await methods.trigger(fields as never))) return;
    }
    if (next > 0) keepDraft(next);
    setStep(next);
  };

  // Own pictures need an account: back here after the login, the draft is still there
  const loginForPictures = () => {
    keepDraft(step);
    navigate(`/login?redirect=${encodeURIComponent('/events/new')}`);
  };

  // Last step without an account: keep the bazaar and create it right after the sign-up.
  // A change still waiting for the autosave must not save it again without that mark.
  const guestSubmitted = useRef(false);
  const onGuestSubmit = () => {
    guestSubmitted.current = true;
    keepDraft(step, true);
    navigate(`/register?redirect=${encodeURIComponent(CREATE_DRAFT_PATH)}`);
  };

  // A waiting draft comes back once the form is ready; after the sign-up it is created
  const draftHandled = useRef(false);
  const [creatingDraft, setCreatingDraft] = useState(false);
  // When the restored draft was saved; set while its notice is shown
  const [draftRestored, setDraftRestored] = useState<number>();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const discardDraft = async () => {
    if (isAuthenticated) {
      try {
        await deleteServerDraft({});
      } catch (error) {
        toast.error(t('form.draftDiscardFailed'), {
          description: getUserFacingErrorMessage(error),
        });
        return;
      }
    }
    clearEventDraft();
    reset();
    setPendingLocationCategories([]);
    setEventType(undefined);
    setDraftRestored(undefined);
    setConfirmDiscard(false);
    setContinuedDraftAt(undefined);
    setStep(0);
  };
  useEffect(() => {
    if (
      isEditing ||
      isAuthLoading ||
      !categories ||
      draftHandled.current ||
      (isAuthenticated && serverDraft === undefined)
    )
      return;
    draftHandled.current = true;
    const wantsDraft = searchParams.get('draft') === '1';
    if (wantsDraft) searchParams.delete('draft');
    // From the landing page: start with the kind of bazaar the visitor picked there,
    // even over an older draft
    const type = wantsDraft ? undefined : findEventType(searchParams.get('type') ?? undefined);
    if (type) {
      clearEventDraft();
      searchParams.delete('type');
      setSearchParams(searchParams, { replace: true });
      applyEventType(type.id);
      return;
    }
    if (wantsDraft) setSearchParams(searchParams, { replace: true });
    // The newer one wins: a guest draft made before signing in beats an older saved one
    const local = loadEventDraft<DraftValues>();
    const saved = serverDraft?.draft as Omit<EventDraft<DraftValues>, 'savedAt'> | undefined;
    const continuesSaved =
      !!saved && !!serverDraft && (!local || serverDraft.updatedAt > local.savedAt);
    // A draft kept in this browser may continue the saved one as well
    setContinuedDraftAt(continuesSaved ? serverDraft.updatedAt : local?.continues);
    const draft = continuesSaved ? { ...saved, savedAt: serverDraft.updatedAt } : local;
    if (!draft) {
      // The link of the confirmation mail may open in another browser than the wizard
      if (wantsDraft) toast.warning(t('wizard.draftElsewhere'), { duration: 15_000 });
      return;
    }
    // Switches added after the draft was saved keep their default
    const current = methods.getValues();
    reset({
      ...current,
      ...draft.values,
      coverTemplate: draft.values.coverTemplate ?? undefined,
      features: {
        ...current.features,
        ...withoutNulls(draft.values.features),
        // Drafts from before #303 only knew the kind beside the values
        eventType: draft.values.features?.eventType ?? findEventType(draft.eventType)?.id ?? '',
      },
    });
    setPendingLocationCategories(draft.pendingLocationCategories);
    setEventType(findEventType(draft.eventType)?.id);
    setStep(draftStep(draft));
    if (isAuthenticated && wantsDraft && draft.submitted) {
      setCreatingDraft(true);
    } else {
      setDraftRestored(draft.savedAt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when auth and categories are known
  }, [isEditing, isAuthLoading, categories, isAuthenticated, serverDraft]);
  // Every change waits in this browser (also for signed-in organizers), so a reload or a
  // closed tab loses nothing; "continue later" keeps it in the account
  const keepDraftRef = useRef(keepDraft);
  keepDraftRef.current = keepDraft;
  useEffect(() => {
    if (isEditing) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const subscription = methods.watch(() => {
      if (!draftHandled.current) return;
      clearTimeout(timer);
      // Not on the first step: nothing is typed yet, and a discarded draft stays gone
      timer = setTimeout(() => {
        if (stepRef.current > 0) keepDraftRef.current(stepRef.current, guestSubmitted.current);
      }, 600);
    });
    return () => {
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [isEditing, methods]);
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

      const stored = isEditing ? event : undefined;
      const regionImage = await regionImageChange(
        {
          region: data.features.regionOnly ? data.features.allowedPostalCodes : {},
          venueCode: data.address.postalCode,
          venueCountry: data.address.country,
        },
        stored && {
          region: postalCodesOf(stored.features),
          venueCode: stored.postalCode,
          venueCountry: stored.country,
          image: stored.regionMapImage,
        },
        (file) => generateUploadUrl().then((url) => client.upload(url, file))
      );

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
          services: string[];
          accessCode?: string;
          vendorLimit?: number;
          clearVendorLimit?: boolean;
          coverImage?: Id<'_storage'>;
          eventMapImage?: Id<'_storage'>;
          clearCoverImage?: boolean;
          clearEventMapImage?: boolean;
          regionMapImage?: Id<'_storage'>;
          clearRegionMapImage?: boolean;
          features: FeaturesArgs;
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
          // Empty removes the code; left out it would stay
          accessCode: data.accessCode ?? '',
          vendorLimit:
            typeof data.vendorLimit === 'number' && !isNaN(data.vendorLimit)
              ? data.vendorLimit
              : undefined,
          features: featuresFromForm(data.features),
          sellerLogistics: logisticsFromForm(data.sellerLogistics),
          ...regionImage,
        };

        // Left out the limit would stay
        if (editPayload.vendorLimit === undefined) {
          editPayload.clearVendorLimit = true;
        }
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
          regionMapImage: regionImage.regionMapImage,
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
        // The bazaar was created even if removing an old draft fails; do not turn that
        // success into an error for the organizer.
        deleteServerDraft({}).catch((error: unknown) =>
          console.error('Failed to remove the event draft:', error)
        );
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
    return <PageSkeleton variant="form" />;
  }

  return (
    <div>
      <div>
        {/* Editing is a form; creating shows the preview beside it */}
        <div className={isEditing ? 'page-narrow' : 'page-wide'}>
          {isEditing && (
            <PageHeader
              title={
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {t('settingsPage.title')}
                  {headerAside && <span className="text-base font-normal">{headerAside}</span>}
                </span>
              }
              className="mb-6"
            />
          )}

          {!isEventCreationEnabled && !isEditing && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{t('form.creationDisabled')}</AlertDescription>
            </Alert>
          )}

          <FormProvider {...methods}>
            {isEditing ? (
              <form
                onSubmit={handleSubmit(onSubmit, showFirstInvalidSection)}
                className="space-y-6"
              >
                {notice}
                {isRunning && (
                  <Alert>
                    <AlertDescription>{t('form.running')}</AlertDescription>
                  </Alert>
                )}
                {isAdmin && (
                  <Alert>
                    <AlertDescription>{t('form.adminUnlocked')}</AlertDescription>
                  </Alert>
                )}
                {/*
                  One part at a time, in the order of the wizard. Every tab stays mounted (only
                  hidden), so its fields keep their values and are checked on saving
                */}
                <Tabs
                  value={activeTab}
                  onValueChange={(value) => isSettingsTab(value) && openTab(value)}
                  className="gap-5"
                >
                  <SettingsTabsList
                    directSale={directSale}
                    invalid={(id) =>
                      editSectionFields(id).some((field) => get(methods.formState.errors, field))
                    }
                  />
                  {SETTINGS_TABS.map((id) => (
                    <TabsContent
                      key={id}
                      value={id}
                      forceMount
                      hidden={id !== activeTab}
                      className="space-y-4"
                    >
                      <h2 className="sr-only">
                        {t(`wizard.steps.${stepKey(id, directSale)}.title`)}
                      </h2>
                      <EventSection
                        id={id}
                        categories={categories}
                        pendingLocationCategories={pendingLocationCategories}
                        onPendingLocationCategoriesChange={setPendingLocationCategories}
                        editing={{
                          eventId: eventId!,
                          coverImageUrl: event?.coverImageUrl,
                          eventMapImageUrl: event?.eventMapImageUrl,
                          isRunning,
                          feeLock,
                          registeredFeeGroups: registeredTerms.current?.feeGroups.map((g) => g.id),
                        }}
                      />
                      {/* Deleting is rare: once, at the end of the general settings */}
                      {id === 'basics' && dangerZone}
                    </TabsContent>
                  ))}
                </Tabs>

                {/* Floats over the end of the page as a card of its own */}
                <StickyActionBar className="bottom-[calc(var(--bottom-inset,0px)+var(--tab-bar-bulge,0px)+0.75rem)] mx-0 mb-3 rounded-xl border bg-card/95 px-4 pb-3 shadow-lg md:mx-0 md:px-5 lg:mx-0 lg:px-5">
                  {isDirty && (
                    <span className="text-sm text-muted-foreground">{t('form.unsaved')}</span>
                  )}
                  <Button
                    type="submit"
                    className="ml-auto flex-1 sm:flex-none sm:min-w-40"
                    loading={isSubmitting}
                    disabled={isSubmitting}
                  >
                    {t('form.save')}
                  </Button>
                </StickyActionBar>
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
                // At least as tall as the screen: the bar with back and next stays at its lower edge
                // also when a step is short
                className="flex min-h-[calc(100svh-69px-1rem)] flex-col space-y-6 md:min-h-[calc(100svh-69px-1.5rem)] lg:min-h-[calc(100svh-69px-2rem)]"
              >
                <ConfirmDialog
                  open={confirmReplace}
                  onOpenChange={setConfirmReplace}
                  title={t('wizard.draftReplaceTitle')}
                  description={
                    serverDraft &&
                    t('wizard.draftReplaceText', {
                      title: eventDraftTitle(serverDraft.draft) ?? t('myEvents.draftUntitled'),
                      date: formatDateTimeDE(serverDraft.updatedAt),
                    })
                  }
                  confirmLabel={t('wizard.draftReplace')}
                  destructive
                  onConfirm={() => void continueLater()}
                />
                <ConfirmDialog
                  open={confirmDiscard}
                  onOpenChange={setConfirmDiscard}
                  title={t('wizard.draftDiscardTitle')}
                  description={t('wizard.draftDiscardText')}
                  confirmLabel={t('wizard.draftDiscard')}
                  destructive
                  onConfirm={(event) => {
                    event.preventDefault();
                    void discardDraft();
                  }}
                />
                <WizardHeader
                  step={step}
                  onGoTo={(index) => void goToStep(index)}
                  onCancel={() => {
                    clearEventDraft();
                    navigate('/');
                  }}
                  onContinueLater={
                    !isGuest && step > 0
                      ? () => (replacesOtherDraft ? setConfirmReplace(true) : void continueLater())
                      : undefined
                  }
                  savingLater={savingDraft}
                  disabled={isSubmitting}
                  draftSavedAt={draftRestored}
                  onDiscardDraft={() => setConfirmDiscard(true)}
                />
                <div
                  className={
                    sideBySide
                      ? 'grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]'
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
                      <>
                        <EventTypePicker
                          selected={eventType}
                          onPick={applyEventType}
                          pastEvents={pastEvents}
                          onCopy={handleTemplateSelect}
                        />
                        {/* Choosing a kind goes on by itself; this is the quiet way around it */}
                        <div className="flex justify-center">
                          <Button type="button" variant="outline" onClick={() => goToStep(1)}>
                            {t('wizard.withoutType')}
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </>
                    )}
                    {WIZARD_STEPS[step].sections.map((section) => {
                      // The preview beside follows the group being worked on
                      const use = () => setActiveSection(section);
                      const content = (
                        <EventSection
                          id={section}
                          categories={categories}
                          pendingLocationCategories={pendingLocationCategories}
                          onPendingLocationCategoriesChange={setPendingLocationCategories}
                        />
                      );
                      // A step of one group has no heading of its own; with more, each has one
                      if (WIZARD_STEPS[step].sections.length === 1)
                        return (
                          <div key={section} onFocusCapture={use} onPointerDownCapture={use}>
                            {content}
                          </div>
                        );
                      const title = t(`wizard.steps.${stepKey(section, directSale)}.title`);
                      // Drop-off is prefilled from the date: folded, opened by an error in it
                      return section === 'logistics' ? (
                        <Disclosure
                          key={section}
                          defaultOpen={activeSection === section}
                          onUse={use}
                          title={title}
                          hint={t(`wizard.steps.${stepKey(section, directSale)}.text`)}
                          fields={SECTION_FIELDS[section]}
                        >
                          {content}
                        </Disclosure>
                      ) : (
                        <section
                          key={section}
                          className="space-y-4"
                          onFocusCapture={use}
                          onPointerDownCapture={use}
                        >
                          <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
                          {content}
                        </section>
                      );
                    })}
                    {stepId === 'preview' && (
                      <WizardSummary
                        onEdit={(id) => {
                          // A folded group opens when the summary leads to it
                          setActive({ step: stepOfSection(id), section: id });
                          void goToStep(stepOfSection(id));
                        }}
                      />
                    )}
                    {stepId === 'preview' && (
                      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
                        <div className="min-w-0 lg:sticky lg:top-24 lg:order-2">
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
                    <div
                      id="wizard-preview"
                      // A tall preview scrolls on its own, clear of the bar with the buttons below
                      className="scroll-mt-20 lg:sticky lg:top-24 lg:max-h-[calc(100svh-11rem)] lg:overflow-y-auto lg:pb-1"
                    >
                      <StepPreview
                        id={
                          activeSection &&
                          (WIZARD_STEPS[step].sections as readonly string[]).includes(activeSection)
                            ? activeSection
                            : (WIZARD_STEPS[step].sections[0] ?? stepId)
                        }
                        type={chosenType}
                      />
                    </div>
                  )}
                </div>

                <div aria-hidden className="flex-1" />
                {step > 0 && (
                  <StickyActionBar className="md:mx-0 md:px-0 lg:mx-0 lg:px-0">
                    {step > 0 && (
                      <Button
                        type="button"
                        variant="outline"
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
                        className="ml-auto flex-1 sm:flex-none sm:min-w-40"
                        onClick={() => goToStep(step + 1)}
                      >
                        {t('wizard.next')}
                      </Button>
                    ) : (
                      <Button
                        loading={isSubmitting}
                        key="create"
                        type="submit"
                        className="ml-auto flex-1 sm:flex-none sm:min-w-40"
                        disabled={isSubmitting || !isEventCreationEnabled}
                      >
                        {isSubmitting
                          ? t('form.creating')
                          : isGuest
                            ? t('wizard.guestCreate')
                            : t('form.create')}
                      </Button>
                    )}
                  </StickyActionBar>
                )}
              </form>
            )}
          </FormProvider>
        </div>
      </div>
    </div>
  );
}
