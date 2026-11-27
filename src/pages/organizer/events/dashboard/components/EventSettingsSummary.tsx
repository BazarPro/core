import { formatRegion, postalRegion } from '../../../../../shared/postalCodes';
import { countryName } from '../../../../../i18n/countries';
import type { ReactNode } from 'react';
import { Check, Minus } from 'lucide-react';
import type { Doc } from '../../../../../lib/api/types';
import { resolveEventFeatures } from '../../../../../shared/eventFeatures';
import { VISIBILITY_OPTIONS } from '../../../../../constants/records';
import { formatDateRangeDE, formatPrice } from '../../../../../lib/utils';
import { Badge } from '../../../../../components/ui/badge';
import { dateLocale } from '../../../../../i18n/format';
import { useTranslation } from 'react-i18next';
import { useServiceLabel } from '../../../../../i18n/services';
import { useRequirableFields } from '../../../../../hooks/useCategoryFields';
import { categoryFieldText } from '../../../../../i18n/categoryFields';
import { eventCategoryNames } from '../../../../../i18n/categories';
import { api } from '../../../../../lib/api/functions';
import { useQuery } from '../../../../../lib/api/react';
import { formatEventPlace } from '../../../../../shared/eventJsonLd';
import { toAbsoluteUrl } from '../../../../../lib/seo';
import { SETTINGS_TABS, type SettingsTab } from '../../settingsTabs';

type EventWithLabels = Doc<'events'> & { categoryLabels: string[] };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-1 sm:gap-4 py-2 border-b last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/** The switches of a tab as one list with ticks; nothing when none is shown */
function Features({ label, children }: { label: string; children: ReactNode[] }) {
  if (!children.some(Boolean)) return null;
  return (
    <Row label={label}>
      <ul className="space-y-1.5">{children}</ul>
    </Row>
  );
}

function Feature({ on, title, detail }: { on: boolean; title: string; detail?: string }) {
  const { t } = useTranslation('organizer');
  return (
    <li className="flex items-start gap-2">
      {on ? (
        <Check
          className="h-4 w-4 mt-0.5 text-success-soft-foreground shrink-0"
          aria-label={t('summary.active')}
        />
      ) : (
        <Minus
          className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0"
          aria-label={t('summary.off')}
        />
      )}
      <span className={on ? '' : 'text-muted-foreground'}>
        {title}
        {on && detail && <span className="block text-xs text-muted-foreground">{detail}</span>}
      </span>
    </li>
  );
}

/** Start and optional end in the current language. */
function formatRange(start: number, end?: number) {
  return end === undefined
    ? new Date(start).toLocaleString(dateLocale(), { dateStyle: 'medium', timeStyle: 'short' })
    : formatDateRangeDE(start, end);
}

/**
 * Read-only overview of the current event settings: of one tab of the settings (`section`),
 * or all of them.
 */
export function EventSettingsSummary({
  event,
  section,
}: {
  event: EventWithLabels;
  section?: SettingsTab;
}) {
  const { t } = useTranslation('organizer');
  const serviceLabel = useServiceLabel();
  const requirable = useRequirableFields();
  const categoryList = useQuery(api.categories.getAllCategories);
  const timeFormat = new Intl.DateTimeFormat(dateLocale(), {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const features = resolveEventFeatures(event);
  const region = postalRegion(event.features);
  const logistics = event.sellerLogistics;
  const discountDetail = [
    features.discountStartsAt
      ? t('summary.fromTime', { time: timeFormat.format(features.discountStartsAt) })
      : t('summary.fromStart'),
    t('summary.maxDiscount', { percent: features.maxDiscountPercent }),
  ].join(', ');

  const feature = (on: boolean, title: string, detail?: string) => (
    <Feature key={title} on={on} title={title} detail={detail} />
  );
  // What each tab of the settings holds, in the order of the edit form
  const rows: Record<SettingsTab, ReactNode[]> = {
    basics: [
      <Row key="date" label={t('summary.date')}>
        {formatDateRangeDE(event.startDate, event.endDate)}
      </Row>,
      <Row key="location" label={t('summary.location')}>
        {formatEventPlace(event)}
      </Row>,
    ],
    sale: [
      <Features key="features" label={t('summary.features')}>
        {feature(features.directSale, t('summary.directSale'))}
        {feature(features.discounts, t('summary.discounts'), discountDetail)}
        {feature(features.priceOffers, t('summary.offers'))}
        {feature(features.minimumPrice, t('summary.minimum'))}
        {feature(
          features.questions,
          t('summary.questions'),
          features.questions && features.questionsDuringEventOnly
            ? t('summary.questionsDuringEvent')
            : undefined
        )}
        {feature(features.publicCatalog, t('summary.publicCatalog'))}
      </Features>,
    ],
    items: [
      <Row key="categories" label={t('summary.categories')}>
        <div className="flex flex-wrap gap-1">
          {(eventCategoryNames(event.categories, categoryList) ?? event.categoryLabels).map(
            (label) => (
              <Badge key={label} variant="outline">
                {label}
              </Badge>
            )
          )}
        </div>
      </Row>,
      <Row key="services" label={t('summary.services')}>
        {event.services.length > 0
          ? event.services.map(serviceLabel).join(', ')
          : t('summary.none')}
      </Row>,
      <Features key="features" label={t('summary.features')}>
        {feature(features.photosOptional, t('summary.photosOptional'))}
        {(features.requiredFields?.length ?? 0) > 0 &&
          feature(
            true,
            t('summary.requiredFields', {
              fields: requirable
                .filter((field) => features.requiredFields?.includes(field.key))
                .map((field) => categoryFieldText(field, 'label') ?? field.label)
                .join(', '),
            })
          )}
        {features.maxItemsPerSeller !== undefined &&
          feature(true, t('summary.maxItems', { count: features.maxItemsPerSeller }))}
        {features.maxItemsTotal !== undefined &&
          feature(true, t('summary.maxItemsTotal', { count: features.maxItemsTotal }))}
        {feature(
          true,
          features.labelFormat === 'small' ? t('summary.labelsSmall') : t('summary.labelsLarge')
        )}
        {feature(features.labelMark !== 'none', t('summary.labelMarkUniversal'))}
        {feature(features.priceOnLabel && !features.discounts, t('summary.priceOnLabel'))}
      </Features>,
    ],
    fees: [
      <Row key="commission" label={t('summary.commission')}>
        {event.commission} %
      </Row>,
      <Features key="features" label={t('summary.features')}>
        {features.intakeFee !== undefined &&
          feature(true, t('summary.intakeFee', { amount: formatPrice(features.intakeFee) }))}
        {features.maxFeesPerSeller !== undefined &&
          feature(true, t('summary.maxFees', { amount: formatPrice(features.maxFeesPerSeller) }))}
        {(features.feeGroups?.length ?? 0) > 0 &&
          feature(
            true,
            t('summary.feeGroups', {
              count: features.feeGroups!.length,
              groups: features.feeGroups!.map((group) => group.label).join(', '),
            })
          )}
      </Features>,
    ],
    registration: [
      <Row key="visibility" label={t('summary.visibility')}>
        {VISIBILITY_OPTIONS[event.visibility].title}
      </Row>,
      <Row key="code" label={t('summary.accessCode')}>
        {event.accessCode || t('summary.noCode')}
      </Row>,
      event.visibility === 'approved' && (
        <Row key="link" label={t('summary.eventLink')}>
          <span className="break-all">{toAbsoluteUrl(`/public-events/${event._id}`)}</span>
        </Row>
      ),
      <Row key="limit" label={t('summary.limit')}>
        {event.vendorLimit
          ? t('summary.sellers', { count: event.vendorLimit })
          : t('summary.unlimited')}
      </Row>,
      <Row key="registration" label={t('summary.registration')}>
        {!features.registrationOpen
          ? t('summary.registrationClosed')
          : features.registrationStartsAt !== undefined || features.registrationEndsAt !== undefined
            ? [
                features.registrationStartsAt !== undefined &&
                  t('summary.fromTime', { time: timeFormat.format(features.registrationStartsAt) }),
                features.registrationEndsAt !== undefined &&
                  t('summary.untilTime', { time: timeFormat.format(features.registrationEndsAt) }),
              ]
                .filter(Boolean)
                .join(' ')
            : t('summary.registrationOpen')}
      </Row>,
      <Features key="features" label={t('summary.features')}>
        {region &&
          feature(
            true,
            t('region.short', { codes: formatRegion(region, 8) }),
            region.parts.map((part) => countryName(part.country)).join(', ')
          )}
        {feature(features.privateSellersOnly, t('summary.privateSellers'))}
        {feature(features.fixedSellerData, t('summary.fixedData'))}
      </Features>,
    ],
    logistics: [
      <Row key="dropoff" label={t(features.directSale ? 'summary.setup' : 'summary.dropoff')}>
        {logistics?.dropoffStart !== undefined
          ? formatRange(logistics.dropoffStart, logistics.dropoffEnd)
          : t('summary.notGiven')}
      </Row>,
      <Row key="pickup" label={t(features.directSale ? 'summary.teardown' : 'summary.pickup')}>
        {logistics?.pickupStart !== undefined
          ? formatRange(logistics.pickupStart, logistics.pickupEnd)
          : t('summary.notGiven')}
      </Row>,
    ],
  };

  return (
    <dl data-testid="event-settings-summary">
      {(section ? [section] : SETTINGS_TABS).flatMap((tab) => rows[tab])}
    </dl>
  );
}
