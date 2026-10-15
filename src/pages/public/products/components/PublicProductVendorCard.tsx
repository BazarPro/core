import { useNavigate, useLocation } from 'react-router-dom';
import type { Doc } from '../../../../../convex/_generated/dataModel';
import { MapPin, Calendar, LayoutGrid, ChevronRight } from 'lucide-react';
import { formatDateRangeDE } from '../../../../lib/utils';
import { useTranslation } from 'react-i18next';

/**
 * Where and when the product can be bought; each event links to its public page.
 * Organizers see the seller in their management panel instead.
 */
interface PublicProductVendorCardProps {
  events: Doc<'events'>[];
  productId: string;
  /** Assigned inventory location label per event, when set */
  locationLabelByEventId?: Partial<Record<string, string>>;
}

export function PublicProductVendorCard({
  events,
  productId,
  locationLabelByEventId = {},
}: PublicProductVendorCardProps) {
  const { t } = useTranslation('product');
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { from?: string; eventId?: string } | undefined;

  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('vendor.noEvent')}</p>;
  }

  return (
    <div className="space-y-2">
      {events.map((event) => {
        const locationLabel = locationLabelByEventId[event._id];
        const isLink = state?.eventId !== event._id;
        const content = (
          <>
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="font-semibold leading-tight">{event.title}</div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4 shrink-0" />
                {formatDateRangeDE(event.startDate, event.endDate)}
              </div>
              {event.location && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4 shrink-0" />
                  <span className="truncate">{event.location}</span>
                </div>
              )}
              {locationLabel && (
                <div className="flex items-center gap-2 text-sm">
                  <LayoutGrid className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="text-muted-foreground">{t('vendor.location')}</span>
                    <span className="font-medium">{locationLabel}</span>
                  </span>
                </div>
              )}
            </div>
            {isLink && <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />}
          </>
        );

        return isLink ? (
          <button
            key={event._id}
            type="button"
            className="flex w-full items-center gap-3 rounded-xl border bg-background p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/50"
            onClick={() =>
              navigate(`/public-events/${event._id}`, {
                state: { from: 'product-view', productId },
              })
            }
          >
            {content}
          </button>
        ) : (
          <div key={event._id} className="flex items-center gap-3 rounded-xl border p-3">
            {content}
          </div>
        );
      })}
    </div>
  );
}
