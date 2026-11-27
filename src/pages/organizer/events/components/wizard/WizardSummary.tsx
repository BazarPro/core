import { useId, type ReactNode } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  BadgeEuro,
  Calendar,
  CircleCheck,
  MapPin,
  MessageSquareText,
  Package,
  Pencil,
  Tag,
  Truck,
  Users,
} from 'lucide-react';
import { VISIBILITY_OPTIONS } from '../../../../../constants/records';
import type { EventVisibility } from '../../../../../shared/constants';
import { cn, formatDateRangeDE, formatPrice } from '../../../../../lib/utils';
import { localTime } from '../../../../../lib/eventDates';
import type { FeeGroup } from '../../../../../shared/feeGroups';
import {
  formatRegion,
  postalRegion,
  type PostalCodesByCountry,
} from '../../../../../shared/postalCodes';
import { formGroupAdvantages } from '../../../../../lib/sellerFees';

/** The steps a fact of the summary leads back to. */
export type SummaryStep =
  | 'basics'
  | 'sale'
  | 'items'
  | 'fees'
  | 'registration'
  | 'logistics'
  | 'details';

interface SummaryValues {
  title?: string;
  location?: string;
  address?: { city?: string };
  startDate?: string;
  endDate?: string;
  categories?: string[];
  commission?: number;
  visibility?: EventVisibility;
  contactInfo?: string;
  features?: {
    directSale?: boolean;
    publicCatalog?: boolean;
    discounts?: boolean;
    maxDiscountPercent?: number;
    priceOffers?: boolean;
    minimumPrice?: boolean;
    questions?: boolean;
    maxItemsPerSeller?: number;
    maxItemsTotal?: number;
    maxFeesPerSeller?: number;
    intakeFee?: number;
    feeGroups?: FeeGroup[];
    registrationOpen?: boolean;
    regionOnly?: boolean;
    allowedPostalCodes?: PostalCodesByCountry;
  };
  sellerLogistics?: {
    dropoffStart?: string;
    dropoffEnd?: string;
    pickupStart?: string;
    pickupEnd?: string;
  };
}

const given = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

function Fact({
  icon,
  label,
  onEdit,
  editLabel,
  open,
  children,
}: {
  icon: ReactNode;
  label: string;
  onEdit: () => void;
  editLabel: string;
  open?: boolean;
  children: ReactNode;
}) {
  // The name says what the button does; the value is read after it
  const valueId = useId();
  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={editLabel}
      aria-describedby={valueId}
      className="group flex min-w-0 items-start gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {label}
          <Pencil className="ml-auto h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
        </span>
        <span
          id={valueId}
          className={cn(
            'mt-0.5 line-clamp-2 block text-sm font-medium',
            open && 'italic text-muted-foreground'
          )}
        >
          {children}
        </span>
      </span>
    </button>
  );
}

/**
 * Top of the last step: the key facts of the bazaar, each one click away from the step
 * where it is set.
 */
export function WizardSummary({ onEdit }: { onEdit: (step: SummaryStep) => void }) {
  const { t, i18n } = useTranslation('organizer');
  const values = useFormContext().watch() as SummaryValues;
  const features = values.features ?? {};
  const region = features.regionOnly ? postalRegion(features) : undefined;
  const logistics = values.sellerLogistics ?? {};
  // Sellers stand at their items: hand-in and pickup are setup and teardown (#299)
  const direct = !!features.directSale;
  const openText = t('wizard.summary.open');

  const start = localTime(values.startDate);
  const end = localTime(values.endDate);
  const date = Number.isFinite(start)
    ? formatDateRangeDE(start, Number.isFinite(end) ? end : start)
    : undefined;
  const place = values.location?.trim()
    ? [values.location.trim(), values.address?.city?.trim()].filter(Boolean).join(', ')
    : undefined;

  const percent = given(features.maxDiscountPercent);
  const sale = [
    features.directSale && t('wizard.summary.feat.directSale'),
    features.publicCatalog && t('wizard.summary.feat.publicCatalog'),
    features.discounts &&
      (percent
        ? t('wizard.summary.feat.discountsUpTo', { percent })
        : t('wizard.summary.feat.discounts')),
    features.publicCatalog && features.priceOffers && t('wizard.summary.feat.priceOffers'),
    features.minimumPrice && t('wizard.summary.feat.minimumPrice'),
    features.publicCatalog && features.questions && t('wizard.summary.feat.questions'),
  ].filter(Boolean) as string[];

  const categoryCount = values.categories?.length ?? 0;
  const maxItems = given(features.maxItemsPerSeller);
  const maxItemsTotal = given(features.maxItemsTotal);
  const items = [
    t('wizard.summary.categoryCount', { count: categoryCount }),
    maxItems ? t('wizard.summary.maxItems', { count: maxItems }) : undefined,
    maxItemsTotal ? t('wizard.summary.maxItemsTotal', { count: maxItemsTotal }) : undefined,
  ].filter(Boolean);

  const commission = given(values.commission) ?? 0;
  const intakeFee = given(features.intakeFee);
  const maxFees = given(features.maxFeesPerSeller);
  // "10 % Provision + 3,00 € pro Artikel · höchstens 20,00 € pro Verkäufer"
  const fees = [
    [
      t('wizard.summary.commission', { percent: commission }),
      intakeFee ? t('wizard.summary.intakeFee', { fee: formatPrice(intakeFee) }) : undefined,
    ]
      .filter(Boolean)
      .join(' '),
    maxFees !== undefined ? t('wizard.summary.maxFees', { fee: formatPrice(maxFees) }) : undefined,
    // "Vereinsmitglieder: 5 %"
    ...(features.feeGroups ?? [])
      .filter((group) => group.label.trim())
      .map((group) =>
        t('wizard.summary.feeGroup', {
          label: group.label.trim(),
          advantages: formGroupAdvantages(values, group),
        })
      ),
  ].filter(Boolean);

  const joining = [
    values.visibility ? VISIBILITY_OPTIONS[values.visibility].title : undefined,
    features.registrationOpen === false
      ? t('wizard.summary.registrationClosed')
      : t('wizard.summary.registrationOpen'),
    region ? t('region.short', { codes: formatRegion(region, 4) }) : undefined,
  ].filter(Boolean);

  const time = (value?: string) => {
    const timestamp = localTime(value);
    return Number.isFinite(timestamp)
      ? new Date(timestamp).toLocaleTimeString(i18n.language, {
          hour: '2-digit',
          minute: '2-digit',
        })
      : undefined;
  };
  const span = (label: string, from?: string, to?: string) => {
    const first = time(from);
    if (!first) return undefined;
    const last = time(to);
    return `${label} ${last ? t('time.range', { ns: 'common', start: first, end: last }) : first}`;
  };
  const logisticsText = [
    span(
      t(direct ? 'wizard.summary.setup' : 'wizard.summary.dropoff'),
      logistics.dropoffStart,
      logistics.dropoffEnd
    ),
    span(
      t(direct ? 'wizard.summary.teardown' : 'wizard.summary.pickup'),
      logistics.pickupStart,
      logistics.pickupEnd
    ),
  ]
    .filter(Boolean)
    .join(' · ');

  const step = (id: SummaryStep) =>
    t(`wizard.short.${id === 'logistics' && direct ? 'logisticsDirect' : id}`);
  const edit = (id: SummaryStep) => ({
    onEdit: () => onEdit(id),
    editLabel: t('wizard.summary.edit', { step: step(id) }),
  });

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-2">
        <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-success-soft-foreground" />
        <div>
          <h3 className="font-semibold">{t('wizard.summary.ready')}</h3>
          <p className="text-sm text-muted-foreground">{t('wizard.summary.readyText')}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Fact
          icon={<Calendar className="h-4 w-4" />}
          label={t('wizard.summary.date')}
          open={!date}
          {...edit('basics')}
        >
          {date ?? openText}
        </Fact>
        <Fact
          icon={<MapPin className="h-4 w-4" />}
          label={t('wizard.summary.where')}
          open={!place}
          {...edit('basics')}
        >
          {place ?? openText}
        </Fact>
        <Fact icon={<Tag className="h-4 w-4" />} label={t('wizard.summary.sale')} {...edit('sale')}>
          {sale.length > 0 ? sale.join(' · ') : t('wizard.summary.plain')}
        </Fact>
        <Fact
          icon={<Package className="h-4 w-4" />}
          label={t('wizard.summary.items')}
          open={categoryCount === 0}
          {...edit('items')}
        >
          {items.join(' · ')}
        </Fact>
        <Fact
          icon={<BadgeEuro className="h-4 w-4" />}
          label={t('wizard.summary.fees')}
          {...edit('fees')}
        >
          {fees.join(' · ')}
        </Fact>
        <Fact
          icon={<Users className="h-4 w-4" />}
          label={t('wizard.summary.joining')}
          {...edit('registration')}
        >
          {joining.join(' · ')}
        </Fact>
        <Fact
          icon={<Truck className="h-4 w-4" />}
          label={t(direct ? 'wizard.summary.logisticsDirect' : 'wizard.summary.logistics')}
          open={!logisticsText}
          {...edit('logistics')}
        >
          {logisticsText || openText}
        </Fact>
        <Fact
          icon={<MessageSquareText className="h-4 w-4" />}
          label={t('wizard.summary.contact')}
          open={!values.contactInfo?.trim()}
          {...edit('details')}
        >
          {values.contactInfo?.trim() || openText}
        </Fact>
      </div>
    </section>
  );
}
