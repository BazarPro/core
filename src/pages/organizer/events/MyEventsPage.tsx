import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { ConvexImage } from '../../../components/ui/ConvexImage';
import { Plus, ShoppingBag, Calendar, MapPin, ArrowRight } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { useNavigate } from 'react-router-dom';
import type { Id, Doc } from '../../../../convex/_generated/dataModel';
import { formatDateRangeDE } from '../../../lib/utils';
import { stripMarkdownToText } from '../../../lib/markdown';
import { Badge } from '../../../components/ui/badge';
import { useState } from 'react';
import { Checkbox } from '../../../components/ui/checkbox';
import { Label } from '../../../components/ui/label';

function getApprovalBadge(event: Doc<'events'>) {
  if (event.visibility !== 'public') return null;
  const status = event.approvalStatus;
  if (status === 'rejected') {
    return <Badge variant="destructive">Abgelehnt</Badge>;
  }
  if (status === 'pending' || event.isApproved === false) {
    return <Badge variant="outline">Freigabe ausstehend</Badge>;
  }
  return null;
}

function getApprovalNote(event: Doc<'events'>) {
  if (event.visibility !== 'public') return null;
  if (event.approvalStatus === 'rejected' && event.rejectionReason) {
    return (
      <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
        <div className="text-xs font-medium uppercase tracking-wide text-destructive">
          Abgelehnt
        </div>
        <div className="mt-1 text-sm text-foreground whitespace-pre-line">
          {event.rejectionReason}
        </div>
      </div>
    );
  }
  if (event.approvalStatus === 'pending' || event.isApproved === false) {
    return (
      <div className="mt-3 rounded-md border border-muted px-3 py-2 text-xs text-muted-foreground">
        Wird geprüft – in der Regel dauert das nur kurz.
      </div>
    );
  }
  return null;
}

export function MyEventsPage() {
  const navigate = useNavigate();
  const [includePast, setIncludePast] = useState(false);
  const events = useQuery(api.events.getMyEvents, { includePast });
  const myRoles = useQuery(
    api.eventRoles.getMyRolesForEvents,
    events ? { eventIds: events.map((event) => event._id) } : 'skip'
  );

  const onCreateEvent = () => navigate('/events/new');
  const onViewEvent = (eventId: Id<'events'>) => navigate(`/events/view/${eventId}`);

  const now = Date.now();

  return (
    <div>
      <div className="container mx-auto">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-4xl mb-2">Meine Veranstaltungen</h1>
            <p className="text-muted-foreground mb-4">Verwalte deine Veranstaltungen</p>
            <div className="flex items-center gap-2 bg-muted/30 px-3 py-2 rounded-md border w-fit">
              <Checkbox
                id="include-past"
                checked={includePast}
                onCheckedChange={(checked) => setIncludePast(!!checked)}
              />
              <Label htmlFor="include-past" className="cursor-pointer text-sm">
                Vergangene Veranstaltungen anzeigen
              </Label>
            </div>
          </div>
          <Button size="lg" onClick={onCreateEvent} data-onboarding-id="my-events-new-event-button">
            <Plus className="mr-2 h-5 w-5" />
            Neue Veranstaltung
          </Button>
        </div>

        {events === undefined ? (
          <div className="flex items-center justify-center py-20">
            <span className="loading loading-spinner loading-lg text-primary"></span>
          </div>
        ) : (
          <>
            {/* Events Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {events.map((event: Doc<'events'>) => {
                const rolesForEvent =
                  myRoles?.find((entry) => entry.eventId === event._id)?.roles ?? [];
                const isHelperOnly =
                  rolesForEvent.includes('coorganizer') && !rolesForEvent.includes('organizer');
                const isPast = event.endDate < now;
                return (
                  <div
                    key={event._id}
                    className={`bg-card rounded-lg border overflow-hidden hover:shadow-lg transition-shadow flex flex-col ${isPast ? 'opacity-75 grayscale-[0.5]' : ''}`}
                  >
                    <div className="aspect-video overflow-hidden relative">
                      {event.coverImage ? (
                        <ConvexImage
                          storageId={event.coverImage}
                          alt={event.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center">
                          <Calendar className="w-12 h-12 text-muted-foreground" />
                        </div>
                      )}
                      {isPast && (
                        <div className="absolute top-2 right-2 bg-muted/80 backdrop-blur text-muted-foreground px-2 py-1 rounded text-xs font-medium border border-border">
                          Beendet
                        </div>
                      )}
                    </div>
                    <div className="p-6 flex flex-col flex-1">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <h3 className="text-2xl">{event.title}</h3>
                        <div className="flex flex-col items-end gap-2">
                          {isHelperOnly && <Badge variant="outline">Helfer</Badge>}
                          {getApprovalBadge(event)}
                        </div>
                      </div>
                      <p className="text-muted-foreground mb-4 line-clamp-2">
                        {stripMarkdownToText(event.description)}
                      </p>
                      {getApprovalNote(event)}
                      <div className="space-y-2 mb-6">
                        <div className="flex items-start gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <span className="text-muted-foreground">
                            {formatDateRangeDE(event.startDate, event.endDate)}
                          </span>
                        </div>
                        <div className="flex items-start gap-2 text-sm">
                          <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <span className="text-muted-foreground line-clamp-1">
                            {event.location}
                          </span>
                        </div>
                      </div>
                      <Button className="w-full mt-auto" onClick={() => onViewEvent(event._id)}>
                        Zur Veranstaltung
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {events.length === 0 && (
              <div className="text-center py-12">
                <ShoppingBag className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-xl mb-2">Keine Veranstaltungen gefunden</h3>
                <p className="text-muted-foreground mb-6">
                  {includePast
                    ? 'Es wurden keine Veranstaltungen gefunden.'
                    : 'Erstelle deine erste Veranstaltung, um loszulegen'}
                </p>
                {!includePast && (
                  <Button onClick={onCreateEvent}>
                    <Plus className="mr-2 h-4 w-4" />
                    Neue Veranstaltung erstellen
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
