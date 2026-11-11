import {
  Calendar,
  CalendarClock,
  CalendarPlus,
  Download,
  MapPin,
  Users,
  Clock,
} from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { createGoogleCalendarUrl, downloadIcsEvent } from '../../../../lib/calendar';
import { SellerConditions } from '../../../../components/events/SellerConditions';
import type { SellerConditionsEvent } from '../../../../lib/sellerFees';
import { dateLocale } from '../../../../i18n/format';
import { toAbsoluteUrl } from '../../../../lib/seo';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { formatEventPlace } from '../../../../shared/eventJsonLd';
import { useNowPassing } from '../../../../hooks/useNowPassing';
import { Progress } from '../../../../components/ui/progress';
import { formatDateTimeDE } from '../../../../lib/utils';
import {
  registrationTimes,
  resolveEventFeatures,
  type StoredEventFeatures,
} from '../../../../shared/eventFeatures';

/**
 * Sidebar on the event page: event details (dates, location, places for sellers and the
 * registration), the conditions for sellers and contact info.
 */
export interface EventPageSidebarEvent {
  title: string;
  description?: string;
  startDate: number;
  endDate: number;
  location: string;
  vendorLimit?: number;
  /** Places taken; sent with a `vendorLimit` */
  sellerCount?: number;
  contactInfo: string;
  features?: StoredEventFeatures;
}

interface EventPageSidebarProps {
  event: EventPageSidebarEvent;
  /** Shown to everyone thinking about selling here and to registered sellers */
  conditions?: SellerConditionsEvent;
}

const dateOptions: Intl.DateTimeFormatOptions = {
  dateStyle: 'medium',
};

const timeOptions: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
};

export function EventPageSidebar({ event, conditions }: EventPageSidebarProps) {
  const { t } = useTranslation('events');
  const startDate = new Date(event.startDate);
  const endDate = new Date(event.endDate);
  // Shows "over" once it ends, without a reload; the registration window the same way
  const now = useNowPassing([event.endDate, ...registrationTimes(event)]);
  const isPast = event.endDate < now;
  const registration = isPast ? undefined : registrationText(event, now, t);

  const eventUrl =
    typeof window !== 'undefined' ? toAbsoluteUrl(window.location.pathname) : undefined;
  const googleCalendarUrl = createGoogleCalendarUrl({
    title: event.title,
    description: event.description,
    location: formatEventPlace(event),
    startDate: event.startDate,
    endDate: event.endDate,
    url: eventUrl,
  });

  const isSameDay =
    startDate.getDate() === endDate.getDate() &&
    startDate.getMonth() === endDate.getMonth() &&
    startDate.getFullYear() === endDate.getFullYear();

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-xl border p-6">
        <h3 className="mb-4 text-lg font-semibold">{t('sidebar.details')}</h3>
        <div className="space-y-4">
          {isSameDay ? (
            <>
              <div>
                <div className="flex items-start gap-2 text-sm">
                  <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <div className="text-muted-foreground">{t('sidebar.date')}</div>
                    <div>{startDate.toLocaleDateString(dateLocale(), dateOptions)}</div>
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-start gap-2 text-sm">
                  <Clock className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <div className="text-muted-foreground">{t('sidebar.time')}</div>
                    <div>
                      {t('time.range', {
                        ns: 'common',
                        start: startDate.toLocaleTimeString(dateLocale(), timeOptions),
                        end: endDate.toLocaleTimeString(dateLocale(), timeOptions),
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="flex items-start gap-2 text-sm">
                  <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <div className="text-muted-foreground">{t('sidebar.start')}</div>
                    <div>
                      {t('sidebar.atTime', {
                        date: startDate.toLocaleDateString(dateLocale(), dateOptions),
                        time: startDate.toLocaleTimeString(dateLocale(), timeOptions),
                      })}
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-start gap-2 text-sm">
                  <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <div className="text-muted-foreground">{t('sidebar.end')}</div>
                    <div>
                      {t('sidebar.atTime', {
                        date: endDate.toLocaleDateString(dateLocale(), dateOptions),
                        time: endDate.toLocaleTimeString(dateLocale(), timeOptions),
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
          <div>
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
              <div>
                <div className="text-muted-foreground">{t('sidebar.location')}</div>
                <div>{formatEventPlace(event)}</div>
              </div>
            </div>
          </div>
          {registration && (
            <div className="flex items-start gap-2 text-sm">
              <CalendarClock className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
              <div>
                <div className="text-muted-foreground">{t('sidebar.registration')}</div>
                <div>{registration}</div>
              </div>
            </div>
          )}
          {event.vendorLimit != null && event.vendorLimit > 0 && (
            <div className="flex items-start gap-2 text-sm">
              <Users className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-muted-foreground">{t('sidebar.limit')}</div>
                {event.sellerCount === undefined ? (
                  <div>{t('sidebar.spots', { count: event.vendorLimit })}</div>
                ) : (
                  <>
                    <div>
                      {t('sidebar.taken', {
                        count: Math.min(event.sellerCount, event.vendorLimit),
                        limit: event.vendorLimit,
                      })}
                    </div>
                    <Progress
                      value={Math.min(100, (event.sellerCount / event.vendorLimit) * 100)}
                      className="mt-1.5 h-1.5"
                      aria-hidden
                    />
                  </>
                )}
              </div>
            </div>
          )}
          {!isPast && (
            <div className="pt-2 border-t">
              <div className="text-sm text-muted-foreground mb-2">{t('sidebar.calendar')}</div>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    downloadIcsEvent({
                      title: event.title,
                      description: event.description,
                      location: formatEventPlace(event),
                      startDate: event.startDate,
                      endDate: event.endDate,
                      url: eventUrl,
                    })
                  }
                >
                  <Download className="mr-2 h-4 w-4" />
                  {t('sidebar.ics')}
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={googleCalendarUrl} target="_blank" rel="noopener noreferrer">
                    <CalendarPlus className="mr-2 h-4 w-4" />
                    {t('sidebar.google')}
                  </a>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {conditions && (
        <SellerConditions event={conditions} className="bg-card rounded-xl border p-6" compact />
      )}

      <div className="bg-card rounded-xl border p-6">
        <h3 className="mb-4 text-lg font-semibold">{t('sidebar.contact')}</h3>
        <p className="text-sm text-muted-foreground whitespace-pre-line">{event.contactInfo}</p>
      </div>
    </div>
  );
}

/**
 * The registration window, only where the organizer set one or closed it: "bis 14.03.2026,
 * 18:00", "ab …", "… bis …" or "geschlossen, nur mit Einladung".
 */
function registrationText(
  event: { features?: StoredEventFeatures },
  now: number,
  t: TFunction<'events'>
): string | undefined {
  const {
    registrationOpen,
    registrationStartsAt: from,
    registrationEndsAt: until,
  } = resolveEventFeatures(event);
  if (!registrationOpen || (until !== undefined && now >= until)) {
    return t('sidebar.registrationClosed');
  }
  if (from !== undefined && now < from) {
    return until === undefined
      ? t('sidebar.registrationFrom', { time: formatDateTimeDE(from) })
      : t('sidebar.registrationWindow', {
          from: formatDateTimeDE(from),
          until: formatDateTimeDE(until),
        });
  }
  return until === undefined
    ? undefined
    : t('sidebar.registrationUntil', { time: formatDateTimeDE(until) });
}
