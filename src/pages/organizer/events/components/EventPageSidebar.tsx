import { Calendar, CalendarPlus, Download, MapPin, Users, Clock } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { createGoogleCalendarUrl, downloadIcsEvent } from '../../../../lib/calendar';

/**
 * Sidebar on the event page: event details (dates, location, vendor limit) and contact info.
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
}

const dateOptions: Intl.DateTimeFormatOptions = {
  dateStyle: 'medium',
};

const timeOptions: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
};

export function EventPageSidebar({ event }: EventPageSidebarProps) {
  const startDate = new Date(event.startDate);
  const endDate = new Date(event.endDate);
  const now = Date.now();
  const isPast = event.endDate < now;

  const eventUrl = typeof window !== 'undefined' ? window.location.href : undefined;
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
        <h3 className="mb-4">Veranstaltungsdetails</h3>
        <div className="space-y-4">
          {isSameDay ? (
            <>
              <div>
                <div className="flex items-start gap-2 text-sm">
                  <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <div className="text-muted-foreground">Datum</div>
                    <div>{startDate.toLocaleDateString('de-DE', dateOptions)}</div>
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-start gap-2 text-sm">
                  <Clock className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <div className="text-muted-foreground">Uhrzeit</div>
                    <div>
                      {startDate.toLocaleTimeString('de-DE', timeOptions)} -{' '}
                      {endDate.toLocaleTimeString('de-DE', timeOptions)} Uhr
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
                    <div className="text-muted-foreground">Start</div>
                    <div>
                      {startDate.toLocaleDateString('de-DE', dateOptions)},{' '}
                      {startDate.toLocaleTimeString('de-DE', timeOptions)} Uhr
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-start gap-2 text-sm">
                  <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <div className="text-muted-foreground">Ende</div>
                    <div>
                      {endDate.toLocaleDateString('de-DE', dateOptions)},{' '}
                      {endDate.toLocaleTimeString('de-DE', timeOptions)} Uhr
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
                <div className="text-muted-foreground">Ort</div>
                <div>{event.location}</div>
              </div>
            </div>
          </div>
          {event.vendorLimit != null && (
            <div>
              <div className="flex items-start gap-2 text-sm">
                <Users className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div>
                  <div className="text-muted-foreground">Verkäufer-Limit</div>
                  <div>{event.vendorLimit} Plätze</div>
                </div>
              </div>
            </div>
          )}
          {!isPast && (
            <div className="pt-2 border-t">
              <div className="text-sm text-muted-foreground mb-2">Kalender</div>
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
                  Als ICS herunterladen
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={googleCalendarUrl} target="_blank" rel="noopener noreferrer">
                    <CalendarPlus className="mr-2 h-4 w-4" />
                    In Google Kalender
                  </a>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-card rounded-lg border p-6">
        <h3 className="mb-4">Kontakt</h3>
        <p className="text-sm text-muted-foreground whitespace-pre-line">{event.contactInfo}</p>
      </div>
    </div>
  );
}
