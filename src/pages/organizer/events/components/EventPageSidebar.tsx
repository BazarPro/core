import { Calendar, CalendarPlus, Download, MapPin, Users, Clock } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { createGoogleCalendarUrl, downloadIcsEvent } from '../../../../lib/calendar';
import { SellerConditions } from '../../../../components/events/SellerConditions';
import type { SellerConditionsEvent } from '../../../../lib/sellerFees';
import { dateLocale } from '../../../../i18n/format';
import { toAbsoluteUrl } from '../../../../lib/seo';
import { useTranslation } from 'react-i18next';
import { formatEventPlace } from '../../../../shared/eventJsonLd';

/**
 * Sidebar on the event page: event details (dates, location, vendor limit), the
 * conditions for sellers and contact info.
 */
export interface EventPageSidebarEvent {
  title: string;
  description?: string;
  startDate: number;
  endDate: number;
  location: string;
  vendorLimit?: number;
  contactInfo: string;
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
  const now = Date.now();
  const isPast = event.endDate < now;

  const eventUrl =
    typeof window !== 'undefined' ? toAbsoluteUrl(window.location.pathname) : undefined;
  const googleCalendarUrl = createGoogleCalendarUrl({
    title: event.title,
    description: event.description,
    location: event.location,
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
      <div className="bg-card rounded-lg border p-6">
        <h3 className="mb-4">{t('sidebar.details')}</h3>
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
          {event.vendorLimit != null && (
            <div>
              <div className="flex items-start gap-2 text-sm">
                <Users className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div>
                  <div className="text-muted-foreground">{t('sidebar.limit')}</div>
                  <div>{t('sidebar.spots', { count: event.vendorLimit })}</div>
                </div>
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
                      location: event.location,
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
        <SellerConditions event={conditions} className="bg-card rounded-lg border p-6" compact />
      )}

      <div className="bg-card rounded-lg border p-6">
        <h3 className="mb-4">{t('sidebar.contact')}</h3>
        <p className="text-sm text-muted-foreground whitespace-pre-line">{event.contactInfo}</p>
      </div>
    </div>
  );
}
