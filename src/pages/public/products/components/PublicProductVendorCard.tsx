import { useNavigate, useLocation } from 'react-router-dom';
import type { Doc, Id } from '../../../../../convex/_generated/dataModel';
import { User, MapPin, Calendar, ExternalLink, LayoutGrid } from 'lucide-react';
import { formatDateRangeDE } from '../../../../lib/utils';

/**
 * Card showing vendor name and the events where this product is offered; each event is
 * clickable to navigate to that event's product list.
 */
interface PublicProductVendorCardProps {
  vendorFirstName: string;
  vendorLastName?: string;
  vendorId: Id<'users'>;
  isOrganizer: boolean;
  organizerEventId: Id<'events'> | null;
  events: Doc<'events'>[];
  productId: string;
  /** Assigned inventory location label per event, when set */
  locationLabelByEventId?: Partial<Record<string, string>>;
}

export function PublicProductVendorCard({
  vendorFirstName,
  vendorLastName,
  vendorId,
  isOrganizer,
  organizerEventId,
  events,
  productId,
  locationLabelByEventId = {},
}: PublicProductVendorCardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { from?: string; eventId?: string } | undefined;

  const vendorDisplayName = vendorLastName
    ? `${vendorFirstName} ${vendorLastName}`
    : vendorFirstName;

  const handleVendorClick = () => {
    if (isOrganizer && organizerEventId) {
      navigate(`/events/view/${organizerEventId}/products?vendor=${vendorId}`);
    }
  };

  return (
    <div className="bg-card rounded-lg border p-6 space-y-4 shadow-sm">
      {isOrganizer && (
        <div
          className="flex items-start gap-3 cursor-pointer hover:bg-muted/50 p-2 -mx-2 rounded transition-colors group"
          onClick={handleVendorClick}
        >
          <User className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-muted-foreground">
              Verkäufer (Nur für Veranstalter sichtbar)
            </div>
            <div className="font-medium flex items-center gap-2">
              {vendorDisplayName}
              <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </div>
      )}

      {events.length > 0 ? (
        events.map((event) => {
          const locationLabel = locationLabelByEventId[event._id];
          return (
            <div
              key={event._id}
              className={`pt-4 border-t first:border-t-0 first:pt-0 ${
                state?.eventId !== event._id
                  ? 'cursor-pointer hover:bg-muted/50 p-2 -mx-2 rounded transition-colors'
                  : ''
              }`}
              onClick={() => {
                if (state?.eventId !== event._id) {
                  navigate(`/public-events/${event._id}`, {
                    state: { from: 'product-view', productId },
                  });
                }
              }}
            >
              <div className="flex items-start gap-3 mb-2">
                <MapPin className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-sm text-muted-foreground">Veranstaltung</div>
                  <div className="font-medium">{event.title}</div>
                  <div className="text-sm text-muted-foreground">{event.location}</div>
                </div>
              </div>

              {locationLabel ? (
                <div className="flex items-start gap-3 mb-3">
                  <LayoutGrid className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-sm text-muted-foreground">Standort vor Ort</div>
                    <div className="font-medium">{locationLabel}</div>
                  </div>
                </div>
              ) : null}

              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-sm text-muted-foreground">Verfügbar am</div>
                  <div>{formatDateRangeDE(event.startDate, event.endDate)}</div>
                </div>
              </div>
            </div>
          );
        })
      ) : (
        <div className="text-sm text-muted-foreground">Keine Veranstaltung verknüpft</div>
      )}
    </div>
  );
}
