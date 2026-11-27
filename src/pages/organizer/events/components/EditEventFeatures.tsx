import { FormSection, FORM_ROWS } from '../../../../components/ui/form-section';
import { NativeSelect } from '../../../../components/ui/native-select';
import { EVENT_TYPES } from '../../../../lib/eventTypes';
import { FieldError } from '../../../../components/ui/field-error';
import type { ReactNode } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { Checkbox } from '../../../../components/ui/checkbox';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { useQuery } from '../../../../lib/api/react';
import { api } from '../../../../lib/api/functions';
import { MAX_DISCOUNT_PERCENT } from '../../../../shared/eventFeatures';
import { getCategoryFields } from '../../../../shared/categoryFields';
import { expandCategories } from '../../../../shared/categoryTree';
import { useRequirableFields } from '../../../../hooks/useCategoryFields';
import { feeLockHint, feeLockShort, type FeeLock } from '../../../../lib/sellerFees';
import { categoryFieldText } from '../../../../i18n/categoryFields';
import { useTranslation } from 'react-i18next';
import {
  BadgeEuro,
  Globe,
  HandCoins,
  Handshake,
  ImageOff,
  Lock,
  MessageCircleQuestion,
  Percent,
  Printer,
  ShieldCheck,
  UserCheck,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { InfoTip, LabelWithInfo } from '../../../../components/ui/info-tip';
import { Switch } from '../../../../components/ui/switch';
import { cn } from '../../../../lib/utils';

type FeatureKey =
  | 'discounts'
  | 'priceOffers'
  | 'minimumPrice'
  | 'questions'
  | 'photosOptional'
  | 'publicCatalog'
  | 'priceOnLabel'
  | 'privateSellersOnly'
  | 'fixedSellerData'
  | 'directSale'
  | 'registrationOpen';

const FEATURE_ICONS: Record<FeatureKey, LucideIcon> = {
  discounts: Percent,
  priceOffers: BadgeEuro,
  minimumPrice: Handshake,
  questions: MessageCircleQuestion,
  photosOptional: ImageOff,
  publicCatalog: Globe,
  priceOnLabel: Printer,
  privateSellersOnly: UserCheck,
  fixedSellerData: ShieldCheck,
  directSale: HandCoins,
  registrationOpen: UserPlus,
};

/**
 * One switch: icon, title and the switch in a row, the explanation behind an (i). What the
 * switch opens up (e.g. the highest discount) appears below while it is on.
 */
function FeatureToggle({
  name,
  title,
  description,
  disabledHint,
  children,
}: {
  name: FeatureKey;
  title: string;
  description: ReactNode;
  /** Set while another switch rules this one out; shows unchecked with this reason */
  disabledHint?: string;
  children?: ReactNode;
}) {
  const { control, watch } = useFormContext();
  const disabled = !!disabledHint;
  const enabled = !disabled && (watch(`features.${name}`) as boolean);
  const id = `feature-${name}`;
  const Icon = FEATURE_ICONS[name];

  return (
    <div className={disabled ? 'opacity-60' : undefined}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
            enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        {/* Inline: a title in two lines keeps its (i) right after the last word */}
        <div className="min-w-0 flex-1 leading-snug">
          <Label
            htmlFor={id}
            className={cn(
              'inline leading-snug',
              disabled ? 'font-medium' : 'cursor-pointer font-medium'
            )}
          >
            {title}
          </Label>{' '}
          <InfoTip className="-my-1">{description}</InfoTip>
        </div>
        <Controller
          name={`features.${name}`}
          control={control}
          render={({ field }) => (
            <Switch
              id={id}
              checked={!disabled && !!field.value}
              disabled={disabled}
              onCheckedChange={(checked: boolean | string) => field.onChange(!!checked)}
            />
          )}
        />
      </div>
      {disabledHint && <p className="mt-1 pl-11 text-xs text-muted-foreground">{disabledHint}</p>}
      {enabled && children && (
        <div className="mt-3 space-y-4 pl-11 animate-in fade-in slide-in-from-top-1 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}

/** A plain checkbox with title and explanation, e.g. inside a switched-on feature. */
function CheckboxField({
  name,
  title,
  description,
}: {
  name: string;
  title: string;
  description?: string;
}) {
  const { control } = useFormContext();
  const id = `field-${name.replace(/\W/g, '-')}`;
  return (
    <div className="flex items-center gap-2">
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <Checkbox
            id={id}
            checked={!!field.value}
            onCheckedChange={(checked: boolean | string) => field.onChange(!!checked)}
          />
        )}
      />
      <Label htmlFor={id} className="cursor-pointer font-normal">
        {title}
      </Label>
      {description && <InfoTip>{description}</InfoTip>}
    </div>
  );
}

/**
 * Category fields every item must have, e.g. the frame number for the police list of a
 * bike bazaar. Offers the fields of the chosen categories; fields required before stay.
 */
function RequiredFieldsPicker() {
  const { t } = useTranslation('organizer');
  const { control, watch } = useFormContext();
  const categoryList = useQuery(api.categories.getAllCategories);
  const requirable = useRequirableFields();
  // A chosen main category stands for its sub-categories, which may have other fields
  const chosenCategories = expandCategories(
    (watch('categories') as string[] | undefined) ?? [],
    categoryList
  );
  const required = (watch('features.requiredFields') as string[] | undefined) ?? [];
  const available = new Set(
    chosenCategories.flatMap((id) => getCategoryFields(id, categoryList).map((f) => f.key))
  );
  const fields = requirable.filter(
    (field) => available.has(field.key) || required.includes(field.key)
  );

  // Nothing to require for the chosen categories: no empty row
  if (fields.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <p className="text-sm font-medium">{t('features.requiredFields')}</p>
        <InfoTip>{t('features.requiredFieldsText')}</InfoTip>
      </div>
      {
        <Controller
          name="features.requiredFields"
          control={control}
          render={({ field }) => {
            const value = (field.value as string[] | undefined) ?? [];
            return (
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                {fields.map((categoryField) => {
                  const id = `required-${categoryField.key}`;
                  return (
                    <div key={categoryField.key} className="flex items-center gap-2">
                      <Checkbox
                        id={id}
                        checked={value.includes(categoryField.key)}
                        onCheckedChange={(checked: boolean | string) =>
                          field.onChange(
                            checked
                              ? [...value, categoryField.key]
                              : value.filter((key) => key !== categoryField.key)
                          )
                        }
                      />
                      <Label htmlFor={id} className="cursor-pointer font-normal">
                        {categoryFieldText(categoryField, 'label') ?? categoryField.label}
                      </Label>
                    </div>
                  );
                })}
              </div>
            );
          }}
        />
      }
    </div>
  );
}

/**
 * From when sellers may give discounts. It has to lie within the event, so it can only be
 * picked once the event's dates are set; the wizard therefore asks for it after them.
 */
function DiscountStartField() {
  const { t } = useTranslation('organizer');
  const {
    register,
    watch,
    formState: { errors },
  } = useFormContext();
  const start = watch('startDate') as string | undefined;
  const end = watch('endDate') as string | undefined;
  const datesSet = !!start && !!end;
  const error = (errors.features as { discountStartsAt?: { message?: string } } | undefined)
    ?.discountStartsAt;
  return (
    <div className="space-y-2">
      <LabelWithInfo htmlFor="discountStartsAt" info={t('features.discountFromHint')}>
        {t('features.discountFrom')}
      </LabelWithInfo>
      <Input
        id="discountStartsAt"
        type="datetime-local"
        disabled={!datesSet}
        min={start || undefined}
        max={end || undefined}
        {...register('features.discountStartsAt')}
      />
      {!datesSet && (
        <p className="text-xs text-muted-foreground">{t('features.discountFromNeedsDates')}</p>
      )}
      {error && <FieldError>{error.message}</FieldError>}
    </div>
  );
}

/**
 * When sellers may join on their own: from and until, both optional. Unlike the discount
 * start it does not depend on the event's dates, so the wizard asks for it right here.
 */
function RegistrationWindowFields() {
  const { t } = useTranslation('organizer');
  const {
    register,
    formState: { errors },
  } = useFormContext();
  const error = (errors.features as { registrationEndsAt?: { message?: string } } | undefined)
    ?.registrationEndsAt;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <LabelWithInfo htmlFor="registrationStartsAt" info={t('features.registrationWindowHint')}>
            {t('features.registrationFrom')}
          </LabelWithInfo>
          <Input
            id="registrationStartsAt"
            type="datetime-local"
            {...register('features.registrationStartsAt')}
          />
        </div>
        <div className="space-y-2">
          <LabelWithInfo htmlFor="registrationEndsAt">
            {t('features.registrationUntil')}
          </LabelWithInfo>
          <Input
            id="registrationEndsAt"
            type="datetime-local"
            aria-invalid={!!error}
            {...register('features.registrationEndsAt')}
          />
        </div>
      </div>
      {error && <FieldError>{error.message}</FieldError>}
    </div>
  );
}

/** A fee in €, read-only while the bazaar runs. */
function EuroField({
  name,
  label,
  info,
  placeholder,
  max,
  step = 0.5,
  feeLock,
  error,
}: {
  name: 'intakeFee' | 'maxFeesPerSeller';
  label: string;
  info: string;
  placeholder: string;
  max: number;
  step?: number;
  feeLock: FeeLock;
  error?: string;
}) {
  const { register } = useFormContext();
  const running = feeLock === 'running';
  return (
    <div className="space-y-2">
      <LabelWithInfo htmlFor={name} info={info}>
        {label}
      </LabelWithInfo>
      <div className="relative max-w-40">
        <Input
          id={name}
          type="number"
          min={0}
          max={max}
          step={step}
          className="pr-8"
          placeholder={placeholder}
          readOnly={running}
          aria-readonly={running}
          {...register(`features.${name}`, { valueAsNumber: true })}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          €
        </span>
      </div>
      {feeLock && (
        <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <Lock className="size-3" aria-hidden />
          {feeLockShort(feeLock)}
        </p>
      )}
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

/** Groups of switches; the creation wizard shows one group per step. */
export type FeaturePart = 'sale' | 'items' | 'registration' | 'fees';
const ALL_PARTS: FeaturePart[] = ['sale', 'items', 'registration', 'fees'];

/** Organizer chooses which buyer and seller features this event offers. */
export function EditEventFeatures({
  feeLock = null,
  parts = ALL_PARTS,
  showHeader = true,
  bare = false,
  feeExampleKind = false,
  advanced = 'include',
}: {
  feeLock?: FeeLock;
  /** The kind of bazaar for the worked example of the conditions (#303); the wizard asks first */
  feeExampleKind?: boolean;
  parts?: FeaturePart[];
  showHeader?: boolean;
  /** Without its own card, e.g. the intake fee next to the commission */
  bare?: boolean;
  /**
   * Settings most bazaars leave alone (fee cap, private sellers, fixed data): the wizard
   * shows them apart, under "Erweitert" (`exclude` here, `only` there)
   */
  advanced?: 'include' | 'exclude' | 'only';
}) {
  const { t } = useTranslation('organizer');
  const {
    register,
    watch,
    formState: { errors },
  } = useFormContext();
  const discounts = watch('features.discounts') as boolean;
  const priceOnLabel = watch('features.priceOnLabel') as boolean;
  const labelMark = watch('features.labelMark') as string;
  const publicCatalog = watch('features.publicCatalog') as boolean;
  const registrationOpen = watch('features.registrationOpen') as boolean;
  const needsCatalog = publicCatalog === false ? t('features.needsCatalog') : undefined;
  const featureErrors = errors.features as
    | Partial<
        Record<
          | 'maxDiscountPercent'
          | 'intakeFee'
          | 'maxItemsPerSeller'
          | 'maxItemsTotal'
          | 'maxFeesPerSeller',
          { message?: string }
        >
      >
    | undefined;

  const show = (part: FeaturePart) => parts.includes(part);
  const basic = advanced !== 'only';
  const expert = advanced !== 'exclude';

  const content = (
    <>
      {show('sale') && (
        <>
          <FeatureToggle
            name="directSale"
            title={t('features.directSale')}
            description={t('features.directSaleText')}
          />

          <FeatureToggle
            name="publicCatalog"
            title={t('features.publicCatalog')}
            description={t('features.publicCatalogText')}
          />

          <FeatureToggle
            name="discounts"
            title={t('features.discounts')}
            description={t('features.discountsText')}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DiscountStartField />
              <div className="space-y-2">
                <LabelWithInfo htmlFor="maxDiscountPercent">
                  {t('features.maxDiscount')}
                </LabelWithInfo>
                <Input
                  id="maxDiscountPercent"
                  type="number"
                  min={1}
                  max={MAX_DISCOUNT_PERCENT}
                  {...register('features.maxDiscountPercent', { valueAsNumber: true })}
                />
                {featureErrors?.maxDiscountPercent && (
                  <FieldError>{featureErrors.maxDiscountPercent.message}</FieldError>
                )}
              </div>
            </div>
          </FeatureToggle>
          {/* The field is hidden once the discounts are off, its error must not be */}
          {!discounts && featureErrors?.maxDiscountPercent && (
            <FieldError>{featureErrors.maxDiscountPercent.message}</FieldError>
          )}
          <FeatureToggle
            name="priceOffers"
            title={t('features.offers')}
            description={`${t('features.offersText')} ${t('features.payOnSite')}`}
            disabledHint={needsCatalog}
          />

          <FeatureToggle
            name="minimumPrice"
            title={t('features.minimum')}
            description={t('features.minimumText')}
          />

          <FeatureToggle
            name="questions"
            title={t('features.questions')}
            description={t('features.questionsText')}
            disabledHint={needsCatalog}
          >
            <CheckboxField
              name="features.questionsDuringEventOnly"
              title={t('features.questionsDuringEvent')}
              description={t('features.questionsDuringEventText')}
            />
          </FeatureToggle>
        </>
      )}

      {show('items') && (
        <>
          <FeatureToggle
            name="photosOptional"
            title={t('features.photosOptional')}
            description={t('features.photosOptionalText')}
          />

          <RequiredFieldsPicker />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <LabelWithInfo
                htmlFor="maxItemsPerSeller"
                info={`${t('features.maxItemsHint')} ${feeLock ? t('features.maxItemsLocked') : t('features.maxItemsLater')}`}
              >
                {t('features.maxItems')}
              </LabelWithInfo>
              <Input
                id="maxItemsPerSeller"
                type="number"
                min={1}
                className="max-w-40"
                placeholder={t('features.unlimited')}
                {...register('features.maxItemsPerSeller', { valueAsNumber: true })}
              />
              {featureErrors?.maxItemsPerSeller && (
                <FieldError>{featureErrors.maxItemsPerSeller.message}</FieldError>
              )}
            </div>
            <div className="min-w-0 space-y-2">
              <LabelWithInfo htmlFor="maxItemsTotal" info={t('features.maxItemsTotalHint')}>
                {t('features.maxItemsTotal')}
              </LabelWithInfo>
              <Input
                id="maxItemsTotal"
                type="number"
                min={1}
                className="max-w-40"
                placeholder={t('features.unlimited')}
                {...register('features.maxItemsTotal', { valueAsNumber: true })}
              />
              {featureErrors?.maxItemsTotal && (
                <FieldError>{featureErrors.maxItemsTotal.message}</FieldError>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <LabelWithInfo htmlFor="labelFormat" info={t('features.labelsHint')}>
                {t('features.labels')}
              </LabelWithInfo>
              <NativeSelect id="labelFormat" {...register('features.labelFormat')}>
                <option value="standard">{t('features.labelsLarge')}</option>
                <option value="small">{t('features.labelsSmall')}</option>
              </NativeSelect>
            </div>
            <div className="min-w-0 space-y-2">
              <LabelWithInfo
                htmlFor="labelMark"
                info={t(
                  labelMark === 'none'
                    ? 'features.labelMarkNoneHint'
                    : 'features.labelMarkUniversalHint'
                )}
              >
                {t('features.labelMark')}
              </LabelWithInfo>
              <NativeSelect id="labelMark" {...register('features.labelMark')}>
                <option value="universal">{t('features.labelMarkUniversal')}</option>
                <option value="none">{t('features.labelMarkNone')}</option>
              </NativeSelect>
            </div>
          </div>

          <FeatureToggle
            name="priceOnLabel"
            title={t('features.priceOnLabel')}
            description={t('features.priceOnLabelText')}
          />
          {priceOnLabel && discounts && (
            <p className="text-sm text-muted-foreground">{t('features.priceOnLabelDiscounts')}</p>
          )}
        </>
      )}

      {show('registration') && (
        <>
          {basic && (
            // The hint belongs to its switch: one row, no line between them
            <div className="space-y-2">
              <FeatureToggle
                name="registrationOpen"
                title={t('features.registrationOpen')}
                description={t('features.registrationOpenText')}
              >
                <RegistrationWindowFields />
              </FeatureToggle>
              {!registrationOpen && (
                <p className="pl-11 text-xs text-muted-foreground">
                  {t('features.registrationClosedHint')}
                </p>
              )}
            </div>
          )}

          {expert && (
            <>
              <FeatureToggle
                name="privateSellersOnly"
                title={t('features.privateSellers')}
                description={t('features.privateSellersText')}
              />

              <FeatureToggle
                name="fixedSellerData"
                title={t('features.fixedData')}
                description={t('features.fixedDataText')}
              />
            </>
          )}
        </>
      )}

      {show('fees') && (
        <>
          {basic && (
            <EuroField
              name="intakeFee"
              label={t('features.intakeFee')}
              info={feeLock ? feeLockHint(feeLock) : t('features.intakeFeeHint')}
              placeholder={t('features.none')}
              max={100}
              feeLock={feeLock}
              error={featureErrors?.intakeFee?.message}
            />
          )}
          {expert && (
            <EuroField
              name="maxFeesPerSeller"
              label={t('features.maxFees')}
              info={`${t('features.maxFeesHint')} ${feeLock ? feeLockHint(feeLock) : t('features.maxFeesLater')}`}
              placeholder={t('features.noCap')}
              max={10_000}
              // Amounts in cents are allowed, like the backend takes them
              step={0.01}
              feeLock={feeLock}
              error={featureErrors?.maxFeesPerSeller?.message}
            />
          )}
          {basic && feeExampleKind && (
            <div className="min-w-0 space-y-2">
              <LabelWithInfo htmlFor="eventType" info={t('features.feeExampleHint')}>
                {t('features.feeExample')}
              </LabelWithInfo>
              <NativeSelect id="eventType" {...register('features.eventType')}>
                <option value="">{t('features.feeExampleNeutral')}</option>
                {EVENT_TYPES.map((type) => (
                  <option key={type.id} value={type.id}>
                    {t(`eventTypes.${type.id}.title`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
        </>
      )}
    </>
  );
  if (bare) return content;
  return (
    <FormSection
      title={showHeader ? t('features.title') : undefined}
      description={showHeader ? t('features.intro') : undefined}
      contentClassName={FORM_ROWS}
    >
      {content}
    </FormSection>
  );
}
