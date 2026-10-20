import type { ReactNode } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { Checkbox } from '../../../../components/ui/checkbox';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { MAX_DISCOUNT_PERCENT } from '../../../../../convex/eventFeatures';
import { getCategoryFields, REQUIRABLE_FIELDS } from '../../../../../convex/categoryFields';
import { feeLockHint, type FeeLock } from '../../../../lib/sellerFees';
import { categoryFieldText } from '../../../../i18n/categoryFields';
import { useTranslation } from 'react-i18next';

type FeatureKey =
  | 'discounts'
  | 'priceOffers'
  | 'minimumPrice'
  | 'questions'
  | 'photosOptional'
  | 'priceOnLabel'
  | 'privateSellersOnly'
  | 'fixedSellerData';

function FeatureToggle({
  name,
  title,
  description,
  children,
}: {
  name: FeatureKey;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  const { control, watch } = useFormContext();
  const enabled = watch(`features.${name}`) as boolean;
  const id = `feature-${name}`;

  return (
    <div className={`rounded-lg border p-4 ${enabled ? 'bg-primary/5 border-primary/40' : ''}`}>
      <div className="flex items-start gap-3">
        <Controller
          name={`features.${name}`}
          control={control}
          render={({ field }) => (
            <Checkbox
              id={id}
              checked={!!field.value}
              onCheckedChange={(checked: boolean | string) => field.onChange(!!checked)}
              className="mt-0.5"
            />
          )}
        />
        <div className="flex-1 space-y-1">
          <Label htmlFor={id} className="cursor-pointer font-medium">
            {title}
          </Label>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {enabled && children && <div className="mt-4 pl-7 space-y-4">{children}</div>}
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
    <div className="flex items-start gap-3">
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <Checkbox
            id={id}
            checked={!!field.value}
            onCheckedChange={(checked: boolean | string) => field.onChange(!!checked)}
            className="mt-0.5"
          />
        )}
      />
      <div className="space-y-0.5">
        <Label htmlFor={id} className="cursor-pointer">
          {title}
        </Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
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
  const chosenCategories = (watch('categories') as string[] | undefined) ?? [];
  const required = (watch('features.requiredFields') as string[] | undefined) ?? [];
  const available = new Set(
    chosenCategories.flatMap((id) => getCategoryFields(id, categoryList).map((f) => f.key))
  );
  const fields = REQUIRABLE_FIELDS.filter(
    (field) => available.has(field.key) || required.includes(field.key)
  );

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="space-y-1">
        <p className="font-medium">{t('features.requiredFields')}</p>
        <p className="text-sm text-muted-foreground">{t('features.requiredFieldsText')}</p>
      </div>
      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('features.requiredFieldsNone')}</p>
      ) : (
        <Controller
          name="features.requiredFields"
          control={control}
          render={({ field }) => {
            const value = (field.value as string[] | undefined) ?? [];
            return (
              <div className="grid gap-2 sm:grid-cols-2">
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
      )}
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
}: {
  feeLock?: FeeLock;
  parts?: FeaturePart[];
  showHeader?: boolean;
}) {
  const { t } = useTranslation('organizer');
  const {
    register,
    watch,
    formState: { errors },
  } = useFormContext();
  const discounts = watch('features.discounts') as boolean;
  const priceOnLabel = watch('features.priceOnLabel') as boolean;
  const featureErrors = errors.features as
    | Partial<
        Record<
          'maxDiscountPercent' | 'discountStartsAt' | 'intakeFee' | 'maxItemsPerSeller',
          { message?: string }
        >
      >
    | undefined;

  const show = (part: FeaturePart) => parts.includes(part);

  return (
    <div className="bg-card rounded-lg border p-6 space-y-4">
      {showHeader && (
        <div>
          <h2 className="text-2xl">{t('features.title')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('features.intro')}</p>
        </div>
      )}

      {show('sale') && (
        <>
          <FeatureToggle
            name="discounts"
            title={t('features.discounts')}
            description={t('features.discountsText')}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="discountStartsAt">{t('features.discountFrom')}</Label>
                <Input
                  id="discountStartsAt"
                  type="datetime-local"
                  {...register('features.discountStartsAt')}
                />
                <p className="text-xs text-muted-foreground">{t('features.discountFromHint')}</p>
                {featureErrors?.discountStartsAt && (
                  <p className="text-sm text-destructive">
                    {featureErrors.discountStartsAt.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxDiscountPercent">{t('features.maxDiscount')}</Label>
                <Input
                  id="maxDiscountPercent"
                  type="number"
                  min={1}
                  max={MAX_DISCOUNT_PERCENT}
                  {...register('features.maxDiscountPercent', { valueAsNumber: true })}
                />
                {featureErrors?.maxDiscountPercent && (
                  <p className="text-sm text-destructive">
                    {featureErrors.maxDiscountPercent.message}
                  </p>
                )}
              </div>
            </div>
          </FeatureToggle>
          <FeatureToggle
            name="priceOffers"
            title={t('features.offers')}
            description={t('features.offersText')}
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
          <div className="space-y-2 rounded-lg border p-4">
            <Label htmlFor="maxItemsPerSeller">{t('features.maxItems')}</Label>
            <Input
              id="maxItemsPerSeller"
              type="number"
              min={1}
              className="max-w-40"
              placeholder={t('features.unlimited')}
              {...register('features.maxItemsPerSeller', { valueAsNumber: true })}
            />
            <p className="text-xs text-muted-foreground">
              {t('features.maxItemsHint')}{' '}
              {feeLock ? t('features.maxItemsLocked') : t('features.maxItemsLater')}
            </p>
            {featureErrors?.maxItemsPerSeller && (
              <p className="text-sm text-destructive">{featureErrors.maxItemsPerSeller.message}</p>
            )}
          </div>
          <div className="space-y-2 rounded-lg border p-4">
            <Label htmlFor="labelFormat">{t('features.labels')}</Label>
            <select
              id="labelFormat"
              className="flex h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              {...register('features.labelFormat')}
            >
              <option value="standard">{t('features.labelsLarge')}</option>
              <option value="small">{t('features.labelsSmall')}</option>
            </select>
            <p className="text-xs text-muted-foreground">{t('features.labelsHint')}</p>
          </div>

          <FeatureToggle
            name="priceOnLabel"
            title={t('features.priceOnLabel')}
            description={t('features.priceOnLabelText')}
          />
          {priceOnLabel && discounts && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {t('features.priceOnLabelDiscounts')}
            </p>
          )}
        </>
      )}

      {show('registration') && (
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

      {show('fees') && (
        <div className="space-y-2 rounded-lg border p-4">
          <Label htmlFor="intakeFee">{t('features.intakeFee')}</Label>
          <Input
            id="intakeFee"
            type="number"
            min={0}
            max={100}
            step={0.5}
            className={
              feeLock === 'running' ? 'max-w-40 opacity-60 cursor-not-allowed' : 'max-w-40'
            }
            placeholder={t('features.none')}
            readOnly={feeLock === 'running'}
            aria-readonly={feeLock === 'running'}
            {...register('features.intakeFee', { valueAsNumber: true })}
          />
          <p className="text-xs text-muted-foreground">
            {feeLock ? feeLockHint(feeLock) : t('features.intakeFeeHint')}
          </p>
          {featureErrors?.intakeFee && (
            <p className="text-sm text-destructive">{featureErrors.intakeFee.message}</p>
          )}
        </div>
      )}

      {show('sale') && <p className="text-xs text-muted-foreground">{t('features.payOnSite')}</p>}
    </div>
  );
}
