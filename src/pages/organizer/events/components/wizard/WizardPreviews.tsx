import type { ReactNode } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import {
  BadgeEuro,
  Calendar,
  Camera,
  Check,
  ClipboardCheck,
  Globe,
  KeyRound,
  Lock,
  MapPin,
  MessageCircle,
  Package,
  Send,
  ShieldCheck,
  Tag,
  Truck,
  Users,
} from 'lucide-react';
import { Badge } from '../../../../../components/ui/badge';
import { ItemPhoto } from '../../../../../components/illustrations/ItemIllustrations';
import { SafeMarkdown } from '../../../../../components/markdown/SafeMarkdown';
import { SellerConditions } from '../../../../../components/events/SellerConditions';
import { AppBar, PhoneFrame } from '../../../../public/landing/components/demo/Illustrations';
import { useQuery } from '../../../../../lib/api/react';
import { api } from '../../../../../lib/api/functions';
import { EVENT_TYPES, type EventType } from '../../../../../lib/eventTypes';
import {
  describeSellerFees,
  formatSignedEuro,
  type SellerConditionsEvent,
} from '../../../../../lib/sellerFees';
import { cn, formatDateRangeDE, formatPriceDE } from '../../../../../lib/utils';
import { categoryFieldText } from '../../../../../i18n/categoryFields';
import { REQUIRABLE_FIELDS } from '../../../../../shared/categoryFields';
import { formatEventPlace } from '../../../../../shared/eventJsonLd';
import { MAX_DISCOUNT_PERCENT } from '../../../../../shared/eventFeatures';

/*
 * Previews of the creation wizard: next to each step they show what buyers and sellers
 * notice of the settings, drawn with the app's own look and the item of the chosen kind
 * of bazaar. They read the form live, so every switch changes the picture at once.
 */

/** Without a template the previews show the general second-hand bazaar. */
const FALLBACK_TYPE = EVENT_TYPES.find((type) => type.id === 'clothingBazaar')!;

interface WizardValues {
  title?: string;
  description?: string;
  location?: string;
  address?: { street?: string; postalCode?: string; city?: string; country?: string };
  startDate?: string;
  endDate?: string;
  categories?: string[];
  commission?: number;
  visibility?: string;
  accessCode?: string;
  vendorLimit?: number;
  features?: {
    discounts?: boolean;
    discountStartsAt?: string;
    maxDiscountPercent?: number;
    priceOffers?: boolean;
    minimumPrice?: boolean;
    questions?: boolean;
    questionsDuringEventOnly?: boolean;
    photosOptional?: boolean;
    requiredFields?: string[];
    maxItemsPerSeller?: number;
    labelFormat?: 'standard' | 'small';
    priceOnLabel?: boolean;
    intakeFee?: number;
    privateSellersOnly?: boolean;
    fixedSellerData?: boolean;
  };
  sellerLogistics?: {
    dropoffStart?: string;
    dropoffEnd?: string;
    pickupStart?: string;
    pickupEnd?: string;
  };
}

/** The description as on the bazaar page, a size smaller. */
const MARKDOWN =
  'text-foreground/90 leading-6 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:mb-3 [&_ol]:mb-3 [&_li]:ml-5 [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:font-semibold [&_a]:text-primary [&_a]:underline';

function useWizardValues(): WizardValues {
  return useFormContext().watch() as WizardValues;
}

const given = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/** "Sa., 18.04., 14:00" for a datetime-local value; undefined when empty. */
function formatLocal(value: string | undefined, locale: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleString(locale, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function useExamples(type: EventType | undefined) {
  const { t } = useTranslation('organizer');
  const kind = type ?? FALLBACK_TYPE;
  const titles = t(`eventTypes.${kind.id}.exampleItems`, { returnObjects: true }) as string[];
  return {
    kind,
    items: kind.examplePrices.map((price, index) => ({ title: titles[index] ?? '', price })),
    eventTitle: t(`eventTypes.${kind.id}.exampleTitle`),
  };
}

/** The box around a preview: a light canvas with a caption, like a sheet on a desk. */
export function PreviewCanvas({
  caption,
  children,
  className,
}: {
  caption: string;
  children: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation('organizer');
  return (
    <figure
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-muted/40 p-4 sm:p-5',
        '[background-image:radial-gradient(color-mix(in_oklab,var(--muted-foreground)_25%,transparent)_1px,transparent_1px)] [background-size:16px_16px]',
        className
      )}
      aria-label={t('wizard.preview.label')}
    >
      <figcaption className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="rounded-full bg-primary px-2 py-0.5 text-[0.65rem] text-primary-foreground">
          {t('wizard.preview.label')}
        </span>
        {caption}
      </figcaption>
      {children}
    </figure>
  );
}

/** One fact under a preview, e.g. what a switch means for the cash desk. */
function Note({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-xs text-muted-foreground animate-in fade-in duration-500">
      <span className="mt-0.5 shrink-0 text-primary">{icon}</span>
      <span>{children}</span>
    </p>
  );
}

/** Step "sale": the item page on a buyer's phone with discount, haggling, offers, questions. */
export function SalePreview({ type }: { type?: EventType }) {
  const { t, i18n } = useTranslation('organizer');
  const values = useWizardValues();
  const features = values.features ?? {};
  const { kind, items, eventTitle } = useExamples(type);
  const item = items[0];
  const percent = Math.min(
    Math.max(given(features.maxDiscountPercent) ?? 20, 1),
    MAX_DISCOUNT_PERCENT
  );
  const discounted = Math.round(item.price * (1 - percent / 100) * 100) / 100;
  const offer = Math.round(item.price * 0.8);
  const from = formatLocal(features.discountStartsAt, i18n.language);
  const nothing =
    !features.discounts && !features.minimumPrice && !features.priceOffers && !features.questions;

  return (
    <PreviewCanvas caption={t('wizard.preview.buyerPhone')}>
      <PhoneFrame className="mx-auto w-full max-w-[15rem]">
        <AppBar title={values.title?.trim() || eventTitle} />
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2.5">
          <div className="relative overflow-hidden rounded-lg">
            <ItemPhoto kind={kind.item} className="aspect-[4/3]" />
            {features.discounts && (
              <span
                key={percent}
                className="absolute right-1.5 top-1.5 rounded-md bg-destructive px-1.5 py-0.5 text-[0.65rem] font-bold text-white animate-in zoom-in-50 duration-300"
              >
                {t('wizard.preview.discount', { percent })}
              </span>
            )}
          </div>
          <span className="w-fit rounded-full border px-1.5 text-[0.55rem] text-muted-foreground">
            {t(`eventTypes.${kind.id}.title`)}
          </span>
          <p className="text-xs font-bold leading-tight">{item.title}</p>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {features.discounts ? (
              <>
                <span className="text-lg font-extrabold tabular-nums text-destructive">
                  {formatPriceDE(discounted)} €
                </span>
                <span className="text-[0.65rem] text-muted-foreground line-through">
                  {formatPriceDE(item.price)} €
                </span>
              </>
            ) : (
              <span className="text-lg font-extrabold tabular-nums">
                {formatPriceDE(item.price)} €
              </span>
            )}
            {features.minimumPrice && (
              <span className="rounded border border-primary/40 px-1 text-[0.55rem] font-semibold text-primary animate-in fade-in duration-300">
                {t('wizard.preview.negotiable')}
              </span>
            )}
          </div>

          <p className="flex items-center gap-1 text-[0.55rem] text-muted-foreground">
            <MapPin className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">
              {values.location?.trim()
                ? formatEventPlace({ location: values.location, ...values.address })
                : t('wizard.preview.placeOpen')}
            </span>
          </p>

          {features.priceOffers && (
            <div className="space-y-1 rounded-lg border bg-card p-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <p className="text-[0.6rem] font-semibold">{t('wizard.preview.offerTitle')}</p>
              <div className="flex gap-1">
                <span className="flex-1 rounded border bg-background px-1.5 py-0.5 text-[0.6rem] tabular-nums">
                  {formatPriceDE(offer)} €
                </span>
                <span className="flex items-center gap-0.5 rounded bg-primary px-1.5 text-[0.55rem] font-bold text-primary-foreground">
                  <Send className="h-2.5 w-2.5" /> {t('wizard.preview.offerSend')}
                </span>
              </div>
            </div>
          )}

          {features.questions && (
            <div className="space-y-1 rounded-lg border bg-card p-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <p className="flex items-center gap-1 text-[0.6rem] font-semibold">
                <MessageCircle className="h-2.5 w-2.5" /> {t('wizard.preview.questionsTitle')}
              </p>
              <p className="text-[0.55rem]">{t('wizard.preview.question')}</p>
              <p className="rounded bg-muted px-1 py-0.5 text-[0.55rem] text-muted-foreground">
                ↳ {t('wizard.preview.answer')}
              </p>
            </div>
          )}
        </div>
      </PhoneFrame>

      <div className="mt-4 space-y-1.5">
        {nothing && (
          <Note icon={<Check className="h-3.5 w-3.5" />}>{t('wizard.preview.plain')}</Note>
        )}
        {features.discounts && (
          <Note icon={<Tag className="h-3.5 w-3.5" />}>
            {from
              ? t('wizard.preview.discountFrom', { from, percent })
              : t('wizard.preview.discountAlways', { percent })}
          </Note>
        )}
        {features.minimumPrice && (
          <Note icon={<BadgeEuro className="h-3.5 w-3.5" />}>
            {t('wizard.preview.negotiableHint')}
          </Note>
        )}
        {features.priceOffers && (
          <Note icon={<Send className="h-3.5 w-3.5" />}>{t('wizard.preview.offerHint')}</Note>
        )}
        {features.questions && features.questionsDuringEventOnly && (
          <Note icon={<MessageCircle className="h-3.5 w-3.5" />}>
            {t('wizard.preview.questionsLater')}
          </Note>
        )}
      </div>
    </PreviewCanvas>
  );
}

/** The printed hang tag in the chosen format, as on the label sheet. */
function LabelPreview({ small, title, price }: { small: boolean; title: string; price?: number }) {
  const { t } = useTranslation('organizer');
  const number = t('wizard.preview.labelNumber', { seller: 17, item: 42 });
  return (
    <div className="flex flex-col items-center">
      <span className="h-4 w-px bg-foreground/50" />
      <div
        key={small ? 'small' : 'large'}
        className={cn(
          'relative rounded-md bg-white text-zinc-900 shadow-lg ring-1 ring-black/10 animate-in zoom-in-95 duration-300',
          small ? 'flex w-48 items-center gap-2 p-1.5' : 'w-32 p-2 text-center'
        )}
      >
        <span className="absolute left-1/2 top-0.5 h-1 w-1 -translate-x-1/2 rounded-full bg-zinc-300" />
        <QRCodeSVG
          value="https://bazarpro.de"
          size={small ? 52 : 96}
          level="L"
          marginSize={0}
          className={cn('shrink-0', small ? 'h-[52px] w-[52px]' : 'mx-auto mt-1 h-auto w-full')}
        />
        <div className={cn('min-w-0', !small && 'mt-1.5')}>
          {small && <p className="text-sm font-bold leading-none">Nr. 17</p>}
          <p
            className={cn(
              'line-clamp-2 leading-tight',
              small ? 'mt-0.5 text-[0.55rem]' : 'text-[0.6rem]'
            )}
          >
            {title}
          </p>
          <p className={cn('font-bold tabular-nums', small ? 'text-[0.6rem]' : 'mt-0.5 text-xs')}>
            {[!small && number, price !== undefined && `${formatPriceDE(price)} €`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Step "items": label, photo or not, limit and required fields. */
export function ItemsPreview({ type }: { type?: EventType }) {
  const { t } = useTranslation('organizer');
  const values = useWizardValues();
  const features = values.features ?? {};
  const { kind, items } = useExamples(type);
  const categoryList = useQuery(api.categories.getAllCategories);
  const chosen = (categoryList ?? [])
    .filter((category) => values.categories?.includes(category._id as string))
    .map((category) => category.label);
  const required = REQUIRABLE_FIELDS.filter((field) =>
    features.requiredFields?.includes(field.key)
  ).map((field) => categoryFieldText(field, 'label') ?? field.label);
  const limit = given(features.maxItemsPerSeller);
  const small = features.labelFormat === 'small';
  const showPrice = !!features.priceOnLabel && !features.discounts;

  return (
    <PreviewCanvas caption={t('wizard.preview.sellerView')}>
      <div className="flex flex-col items-center gap-4">
        <div className="grid w-full grid-cols-2 gap-3">
          {[0, 1].map((index) => {
            const withPhoto = index === 0 || !features.photosOptional;
            return (
              <div key={index} className="overflow-hidden rounded-lg border bg-card shadow-sm">
                {withPhoto ? (
                  <ItemPhoto kind={kind.item} className="aspect-[4/3]" />
                ) : (
                  <div className="flex aspect-[4/3] flex-col items-center justify-center gap-1 bg-muted text-muted-foreground animate-in fade-in duration-300">
                    <Package className="h-6 w-6" />
                    <span className="text-[0.6rem]">{t('wizard.preview.photoOptional')}</span>
                  </div>
                )}
                <div className="p-2">
                  <p className="line-clamp-1 text-[0.65rem] font-semibold">{items[index].title}</p>
                  <p className="text-xs font-bold tabular-nums">
                    {formatPriceDE(items[index].price)} €
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        <LabelPreview
          small={small}
          title={items[0].title}
          price={showPrice ? items[0].price : undefined}
        />
        <p className="text-center text-[0.65rem] text-muted-foreground">
          {small ? t('wizard.preview.labelSmall') : t('wizard.preview.labelLarge')}
          {!showPrice && <> · {t('wizard.preview.labelPriceHidden')}</>}
        </p>
      </div>
      <div className="mt-4 space-y-1.5">
        <Note icon={<Tag className="h-3.5 w-3.5" />}>
          {chosen.length > 0
            ? t('wizard.preview.categories', { categories: chosen.join(', ') })
            : t('wizard.preview.noCategories')}
        </Note>
        <Note icon={<Camera className="h-3.5 w-3.5" />}>
          {features.photosOptional
            ? t('wizard.preview.photosOptionalNote')
            : t('wizard.preview.photoRequired')}
        </Note>
        <Note icon={<Package className="h-3.5 w-3.5" />}>
          {limit ? t('wizard.preview.maxItems', { count: limit }) : t('wizard.preview.unlimited')}
        </Note>
        {required.length > 0 && (
          <Note icon={<ClipboardCheck className="h-3.5 w-3.5" />}>
            {t('wizard.preview.requiredFields', { fields: required.join(', ') })}
          </Note>
        )}
      </div>
    </PreviewCanvas>
  );
}

/** Step "fees": one item worked out as a bar, plus the example sellers see. */
export function FeesPreview({ type }: { type?: EventType }) {
  const { t } = useTranslation('organizer');
  const values = useWizardValues();
  const { items } = useExamples(type);
  const price = items[0].price;
  const commission = Math.min(Math.max(given(values.commission) ?? 0, 0), 100);
  const intakeFee = Math.max(given(values.features?.intakeFee) ?? 0, 0);
  const kept = Math.round(price * commission) / 100;
  const sellerGets = Math.max(price - kept, 0);
  const sellerShare = price > 0 ? (sellerGets / price) * 100 : 100;
  // The worked example sellers also see in the conditions
  const { example } = describeSellerFees({ commission, intakeFee });

  return (
    <PreviewCanvas caption={t('wizard.preview.sellerView')}>
      <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        <p className="text-sm font-semibold">
          {t('wizard.preview.feeItem', { price: `${formatPriceDE(price)} €` })}
        </p>
        <div className="flex h-8 overflow-hidden rounded-lg text-[0.65rem] font-bold text-white">
          <div
            className="flex items-center justify-center bg-emerald-600 transition-all duration-500"
            style={{ width: `${sellerShare}%` }}
          >
            {sellerShare > 25 && `${formatPriceDE(sellerGets)} €`}
          </div>
          {kept > 0 && (
            <div className="flex flex-1 items-center justify-center bg-primary transition-all duration-500">
              {100 - sellerShare > 12 && `${formatPriceDE(kept)} €`}
            </div>
          )}
        </div>
        <dl className="space-y-1 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" />
            <dt className="flex-1">{t('wizard.preview.sellerGets')}</dt>
            <dd className="font-semibold tabular-nums">{formatPriceDE(sellerGets)} €</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-primary" />
            <dt className="flex-1">{t('wizard.preview.bazaarKeeps')}</dt>
            <dd className="font-semibold tabular-nums">{formatPriceDE(kept)} €</dd>
          </div>
        </dl>
        {intakeFee > 0 && (
          <p className="text-xs text-muted-foreground animate-in fade-in duration-300">
            {t('wizard.preview.intakePerItem', { fee: `${formatPriceDE(intakeFee)} €` })}
          </p>
        )}
        {kept === 0 && intakeFee === 0 && (
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            {t('wizard.preview.free')}
          </p>
        )}
      </div>
      {example && (
        <div className="mt-4 space-y-2 rounded-xl border bg-card p-4 text-xs shadow-sm">
          <p className="text-xs text-muted-foreground">{example.intro}</p>
          <dl className="space-y-1">
            {example.rows.map((row) => (
              <div key={row.label} className="flex justify-between gap-3">
                <dt>{row.label}</dt>
                <dd className="tabular-nums">{formatSignedEuro(row.amount)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-3 border-t pt-1 font-semibold">
              <dt>{t('wizard.preview.sellerGets')}</dt>
              <dd className="tabular-nums">{formatPriceDE(example.total)} €</dd>
            </div>
          </dl>
        </div>
      )}
    </PreviewCanvas>
  );
}

/** Step "registration": the bazaar in the list of the start page. */
export function ListingPreview({ type }: { type?: EventType }) {
  const { t } = useTranslation('organizer');
  const values = useWizardValues();
  const features = values.features ?? {};
  const { kind, eventTitle } = useExamples(type);
  const limit = given(values.vendorLimit);
  const visibility = values.visibility ?? 'public';
  const chips: { icon: ReactNode; text: string }[] = [
    {
      icon: visibility === 'public' ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />,
      text: t(`wizard.preview.${visibility as 'public' | 'logged-in' | 'approved'}`),
    },
  ];
  if (values.accessCode?.trim()) {
    chips.push({ icon: <KeyRound className="h-3 w-3" />, text: t('wizard.preview.accessCode') });
  }
  if (limit) {
    chips.push({
      icon: <Users className="h-3 w-3" />,
      text: t('wizard.preview.spots', { count: limit }),
    });
  }
  if (features.privateSellersOnly) {
    chips.push({
      icon: <ShieldCheck className="h-3 w-3" />,
      text: t('wizard.preview.privateOnly'),
    });
  }
  if (features.fixedSellerData) {
    chips.push({
      icon: <ClipboardCheck className="h-3 w-3" />,
      text: t('wizard.preview.fixedData'),
    });
  }

  return (
    <PreviewCanvas caption={t('wizard.preview.listing')}>
      <div className="overflow-hidden rounded-xl border bg-card shadow-md">
        <ItemPhoto kind={kind.item} className="aspect-[21/9]" />
        <div className="space-y-2 p-4">
          <p className="font-semibold">{values.title?.trim() || eventTitle}</p>
          <PlaceAndDate values={values} />
          <div className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <Badge
                key={chip.text}
                variant="secondary"
                className="gap-1 font-normal animate-in fade-in zoom-in-95 duration-300"
              >
                {chip.icon}
                {chip.text}
              </Badge>
            ))}
          </div>
          <div className="pt-1">
            <span className="inline-flex rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
              {t('wizard.preview.join')}
            </span>
          </div>
        </div>
      </div>
    </PreviewCanvas>
  );
}

function PlaceAndDate({ values, light = false }: { values: WizardValues; light?: boolean }) {
  const { t } = useTranslation('organizer');
  const start = values.startDate ? new Date(values.startDate).getTime() : NaN;
  const end = values.endDate ? new Date(values.endDate).getTime() : NaN;
  const date = Number.isFinite(start)
    ? formatDateRangeDE(start, Number.isFinite(end) ? end : start)
    : t('wizard.preview.dateOpen');
  const place = values.location?.trim()
    ? formatEventPlace({ location: values.location, ...values.address })
    : t('wizard.preview.placeOpen');
  return (
    <div
      className={cn(
        'flex flex-col gap-1 text-xs',
        light ? 'text-white/90' : 'text-muted-foreground'
      )}
    >
      <span className="flex items-center gap-1.5">
        <Calendar className="h-3.5 w-3.5 shrink-0" /> {date}
      </span>
      <span className="flex items-center gap-1.5">
        <MapPin className="h-3.5 w-3.5 shrink-0" /> {place}
      </span>
    </div>
  );
}

/** Top of the bazaar page: picture, title, date and place. */
function HeroPreview({ type, values }: { type?: EventType; values: WizardValues }) {
  const { kind, eventTitle } = useExamples(type);
  return (
    <div className="relative overflow-hidden rounded-xl">
      <ItemPhoto kind={kind.item} className="aspect-[16/8] sm:aspect-[3/1]" />
      <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/80 via-black/30 to-transparent p-4">
        <div className="space-y-1.5">
          <p className="text-lg font-bold leading-tight text-white">
            {values.title?.trim() || eventTitle}
          </p>
          <PlaceAndDate values={values} light />
        </div>
      </div>
    </div>
  );
}

/** Step "basics": the top of the bazaar page and the description as it will read. */
export function PlacePreview({ type }: { type?: EventType }) {
  const { t } = useTranslation('organizer');
  const values = useWizardValues();
  return (
    <PreviewCanvas caption={t('wizard.preview.listing')}>
      <div className="space-y-3 rounded-xl border bg-card p-3 shadow-md">
        <HeroPreview type={type} values={values} />
        <div className="max-h-48 overflow-hidden px-1 text-sm [mask-image:linear-gradient(to_bottom,black_75%,transparent)]">
          {values.description?.trim() ? (
            <SafeMarkdown content={values.description} className={MARKDOWN} />
          ) : (
            <p className="text-muted-foreground">{t('wizard.preview.descriptionOpen')}</p>
          )}
        </div>
      </div>
    </PreviewCanvas>
  );
}

/** Step "logistics": drop-off, bazaar and pickup on a timeline. */
export function LogisticsPreview() {
  const { t, i18n } = useTranslation('organizer');
  const values = useWizardValues();
  const logistics = values.sellerLogistics ?? {};
  const span = (from?: string, to?: string) => {
    const start = formatLocal(from, i18n.language);
    const end = formatLocal(to, i18n.language);
    if (!start) return t('wizard.preview.open');
    return end ? `${start} – ${end.split(', ').pop()}` : start;
  };
  const steps = [
    {
      icon: <Truck className="h-4 w-4" />,
      label: t('wizard.preview.dropoff'),
      when: span(logistics.dropoffStart, logistics.dropoffEnd),
    },
    {
      icon: <Tag className="h-4 w-4" />,
      label: t('wizard.preview.sale'),
      when: span(values.startDate, values.endDate),
    },
    {
      icon: <Package className="h-4 w-4" />,
      label: t('wizard.preview.pickup'),
      when: span(logistics.pickupStart, logistics.pickupEnd),
    },
  ];
  return (
    <PreviewCanvas caption={t('wizard.preview.sellerView')}>
      <ol className="relative space-y-5 rounded-xl border bg-card p-4 shadow-sm">
        <span className="absolute bottom-8 left-[1.85rem] top-8 w-px bg-border" aria-hidden />
        {steps.map((step) => (
          <li key={step.label} className="relative flex items-center gap-3">
            <span className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-4 ring-card">
              {step.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{step.label}</span>
              <span
                className={cn(
                  'block text-xs',
                  step.when === t('wizard.preview.open')
                    ? 'italic text-muted-foreground'
                    : 'text-foreground'
                )}
              >
                {step.when}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </PreviewCanvas>
  );
}

/** Last step: the bazaar page in a browser window, with example offers and conditions. */
export function EventPagePreview({
  type,
  conditions,
}: {
  type?: EventType;
  conditions: SellerConditionsEvent;
}) {
  const { t } = useTranslation('organizer');
  const values = useWizardValues();
  const features = values.features ?? {};
  const { kind, items } = useExamples(type);
  const percent = Math.min(given(features.maxDiscountPercent) ?? 20, MAX_DISCOUNT_PERCENT);

  return (
    <div className="overflow-hidden rounded-2xl border bg-background shadow-xl">
      <div className="flex items-center gap-2 border-b bg-muted/60 px-3 py-2">
        <span className="flex gap-1" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </span>
        <span className="flex-1 truncate rounded-md bg-background px-2 py-0.5 text-center text-[0.65rem] text-muted-foreground">
          {t('wizard.preview.browserUrl')}
        </span>
      </div>
      <div className="space-y-6 p-4 sm:p-6">
        <HeroPreview type={type} values={values} />
        <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
          <div className="space-y-6">
            <div className="text-sm">
              {values.description?.trim() ? (
                <SafeMarkdown content={values.description} className={MARKDOWN} />
              ) : (
                <p className="text-muted-foreground">{t('wizard.preview.descriptionOpen')}</p>
              )}
            </div>
            <section className="space-y-3">
              <div>
                <h3 className="font-semibold">{t('wizard.preview.offersTitle')}</h3>
                <p className="text-xs text-muted-foreground">{t('wizard.preview.offersHint')}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {items.map((item, index) => {
                  // The last example shows a discount, when sellers may give one
                  const discount = features.discounts && index === items.length - 1;
                  const price = discount
                    ? Math.round(item.price * (1 - percent / 100) * 100) / 100
                    : item.price;
                  return (
                    <div key={item.title} className="overflow-hidden rounded-lg border bg-card">
                      <div className="relative">
                        <ItemPhoto kind={kind.item} className="aspect-[4/3]" />
                        {discount && (
                          <span className="absolute right-1.5 top-1.5 rounded bg-destructive px-1 text-[0.6rem] font-bold text-white">
                            {t('wizard.preview.discount', { percent })}
                          </span>
                        )}
                      </div>
                      <div className="space-y-0.5 p-2">
                        <p className="line-clamp-1 text-xs font-semibold">{item.title}</p>
                        <p
                          className={cn(
                            'text-sm font-bold tabular-nums',
                            discount && 'text-destructive'
                          )}
                        >
                          {formatPriceDE(price)} €
                          {features.minimumPrice && !discount && (
                            <span className="ml-1 text-[0.6rem] font-semibold text-primary">
                              VB
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
          <aside className="space-y-4">
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <span className="block rounded-md bg-primary py-2 text-center text-sm font-semibold text-primary-foreground">
                {t('wizard.preview.join')}
              </span>
            </div>
            <SellerConditions
              className="rounded-xl border bg-card p-4 text-sm shadow-sm"
              event={conditions}
              compact
            />
          </aside>
        </div>
      </div>
    </div>
  );
}
