import type { ReactNode } from 'react';
import { Check, Minus } from 'lucide-react';
import type { Doc } from '../../../../../../convex/_generated/dataModel';
import { resolveEventFeatures } from '../../../../../../convex/eventFeatures';
import { VISIBILITY_OPTIONS } from '../../../../../constants/records';
import { formatDateRangeDE, formatPriceDE } from '../../../../../lib/utils';
import { Badge } from '../../../../../components/ui/badge';
import { dateLocale } from '../../../../../i18n/format';
import { useTranslation } from 'react-i18next';
import { serviceLabel } from '../../../../../i18n/services';
import { REQUIRABLE_FIELDS } from '../../../../../../convex/categoryFields';
import { categoryFieldText } from '../../../../../i18n/categoryFields';

type EventWithLabels = Doc<'events'> & { categoryLabels: string[] };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-1 sm:gap-4 py-2 border-b last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function Feature({ on, title, detail }: { on: boolean; title: string; detail?: string }) {
  const { t } = useTranslation('organizer');
  return (
    <li className="flex items-start gap-2">
      {on ? (
        <Check
          className="h-4 w-4 mt-0.5 text-green-600 shrink-0"
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

/** Read-only overview of the current event settings. */
export function EventSettingsSummary({ event }: { event: EventWithLabels }) {
  const { t } = useTranslation('organizer');
  const timeFormat = new Intl.DateTimeFormat(dateLocale(), {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const features = resolveEventFeatures(event);
  const logistics = event.sellerLogistics;
  const discountDetail = [
    features.discountStartsAt
      ? t('summary.fromTime', { time: timeFormat.format(features.discountStartsAt) })
      : t('summary.fromStart'),
    t('summary.maxDiscount', { percent: features.maxDiscountPercent }),
  ].join(', ');

  return (
    <dl data-testid="event-settings-summary">
      <Row label={t('summary.date')}>{formatDateRangeDE(event.startDate, event.endDate)}</Row>
      <Row label={t('summary.location')}>{event.location}</Row>
      <Row label={t('summary.commission')}>{event.commission} %</Row>
      <Row label={t('summary.visibility')}>{VISIBILITY_OPTIONS[event.visibility].title}</Row>
      <Row label={t('summary.accessCode')}>{event.accessCode || t('summary.noCode')}</Row>
      <Row label={t('summary.limit')}>
        {event.vendorLimit
          ? t('summary.sellers', { count: event.vendorLimit })
          : t('summary.unlimited')}
      </Row>
      <Row label={t('summary.dropoff')}>
        {logistics?.dropoffStart !== undefined
          ? formatRange(logistics.dropoffStart, logistics.dropoffEnd)
          : t('summary.notGiven')}
      </Row>
      <Row label={t('summary.pickup')}>
        {logistics?.pickupStart !== undefined
          ? formatRange(logistics.pickupStart, logistics.pickupEnd)
          : t('summary.notGiven')}
      </Row>
      <Row label={t('summary.categories')}>
        <div className="flex flex-wrap gap-1">
          {event.categoryLabels.map((label) => (
            <Badge key={label} variant="outline">
              {label}
            </Badge>
          ))}
        </div>
      </Row>
      <Row label={t('summary.services')}>
        {event.services.length > 0
          ? event.services.map(serviceLabel).join(', ')
          : t('summary.none')}
      </Row>
      <Row label={t('summary.features')}>
        <ul className="space-y-1.5">
          <Feature on={features.discounts} title={t('summary.discounts')} detail={discountDetail} />
          <Feature on={features.priceOffers} title={t('summary.offers')} />
          <Feature on={features.minimumPrice} title={t('summary.minimum')} />
          <Feature
            on={features.questions}
            title={t('summary.questions')}
            detail={
              features.questions && features.questionsDuringEventOnly
                ? t('summary.questionsDuringEvent')
                : undefined
            }
          />
          <Feature on={features.photosOptional} title={t('summary.photosOptional')} />
          <Feature on={features.privateSellersOnly} title={t('summary.privateSellers')} />
          <Feature on={features.fixedSellerData} title={t('summary.fixedData')} />
          {(features.requiredFields?.length ?? 0) > 0 && (
            <Feature
              on={true}
              title={t('summary.requiredFields', {
                fields: REQUIRABLE_FIELDS.filter((field) =>
                  features.requiredFields?.includes(field.key)
                )
                  .map((field) => categoryFieldText(field, 'label') ?? field.label)
                  .join(', '),
              })}
            />
          )}
          {features.maxItemsPerSeller !== undefined && (
            <Feature
              on={true}
              title={t('summary.maxItems', { count: features.maxItemsPerSeller })}
            />
          )}
          {features.intakeFee !== undefined && (
            <Feature
              on={true}
              title={t('summary.intakeFee', { amount: formatPriceDE(features.intakeFee) })}
            />
          )}
          <Feature
            on={true}
            title={
              features.labelFormat === 'small' ? t('summary.labelsSmall') : t('summary.labelsLarge')
            }
          />
          <Feature
            on={features.priceOnLabel && !features.discounts}
            title={t('summary.priceOnLabel')}
          />
        </ul>
      </Row>
    </dl>
  );
}
