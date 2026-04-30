import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';

import { Button } from '../../../components/ui/button';
import { ImageWithFallback } from '../../../components/ui/image-with-fallback';
import { Calendar, MapPin, Check, Package, LogOut, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { useState } from 'react';
import { EventFilters } from '../../../components/events/EventFilters';
import { EventRegistrationDialog } from '../../../components/events/EventRegistrationDialog';
import { formatDateRangeDE } from '../../../lib/utils';
import { stripMarkdownToText } from '../../../lib/markdown';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../../components/ui/alert-dialog';
import { toast } from 'sonner';
import { getUserFacingErrorMessage } from '../../../lib/errors';
import { PostRegistrationSuccessDialog } from '../../../components/events/PostRegistrationSuccessDialog';

const LEAVE_EVENT_ERROR_MESSAGES: Record<string, string> = {
  'Abmeldung nicht möglich: Veranstaltung liegt bereits in der Vergangenheit.':
    'Eine Abmeldung ist für vergangene Veranstaltungen nicht möglich.',
  'Abmeldung nicht möglich: Es gibt bereits Produkte mit Status Verfügbar, Verkauft oder Zurückgegeben.':
    'Du kannst dich nicht abmelden, solange Produkte bereits angenommen, verkauft oder zurückgegeben sind.',
};

function EventCard({
  event,
  isRegistered,
  onJoin,
}: {
  event: Doc<'events'>;
  isRegistered: boolean;
  onJoin: (event: Doc<'events'>) => void;
}) {
  const navigate = useNavigate();
  const productCount = useQuery(
    api.events.getMyProductCountForEvent,
    isRegistered ? { eventId: event._id } : 'skip'
  );
  const leaveEvent = useMutation(api.events.leaveEvent);

  const handleLeave = async () => {
    try {
      await leaveEvent({ eventId: event._id });
      toast.success(`Abmeldung von ${event.title} erfolgreich`);
    } catch (error) {
      console.error(error);
      const description = getUserFacingErrorMessage(error, {
        fallback: 'Ein unbekannter Fehler ist aufgetreten.',
        messageMap: LEAVE_EVENT_ERROR_MESSAGES,
      });
      toast.error('Abmeldung fehlgeschlagen', { description });
    }
  };

  const productCountLabel =
    productCount !== undefined ? `${productCount} Produkt${productCount === 1 ? '' : 'e'}` : '...';

  return (
    <div className="bg-card rounded-lg border overflow-hidden hover:shadow-lg transition-shadow flex flex-col">
      <div className="aspect-video overflow-hidden relative">
        <ImageWithFallback
          storageId={event.coverImage}
          alt={event.title}
          className="w-full h-full object-cover"
        />
        {isRegistered && (
          <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded-md text-sm font-medium flex items-center gap-1 shadow-sm">
            <Check className="h-4 w-4" /> Angemeldet
          </div>
        )}
      </div>
      <div className="p-6 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-2 gap-2">
          <h3 className="text-xl font-bold line-clamp-1">{event.title}</h3>
        </div>
        <p className="text-muted-foreground mb-4 line-clamp-2 flex-1">
          {stripMarkdownToText(event.description)}
        </p>

        <div className="space-y-2 mb-6">
          <div className="flex items-start gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <span className="text-muted-foreground">
              {formatDateRangeDE(event.startDate, event.endDate)}
            </span>
          </div>
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <span className="text-muted-foreground line-clamp-1">{event.location}</span>
          </div>
          {isRegistered && (
            <button
              onClick={() => navigate('/my-products', { state: { filterEvent: event._id } })}
              className="flex items-center gap-2 text-sm font-medium text-primary hover:underline transition-all cursor-pointer"
            >
              <Package className="h-4 w-4" />
              <span>{productCountLabel}</span>
              <Info className="h-3 w-3 opacity-50" />
            </button>
          )}
        </div>

        <div className="flex gap-2 mt-auto">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() =>
              navigate(`/public-events/${event._id}`, {
                state: { from: '/browse-events' },
              })
            }
          >
            Details
          </Button>
          {!isRegistered ? (
            <Button className="flex-1" onClick={() => onJoin(event)}>
              Anmelden
            </Button>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Vom Event abmelden</AlertDialogTitle>
                  <AlertDialogDescription>
                    Möchtest du dich wirklich von "{event.title}" abmelden?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction onClick={handleLeave}>Abmelden</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </div>
  );
}

export function SearchEventsPage() {
  const [includePast, setIncludePast] = useState(false);
  const allEvents = (useQuery(api.events.get, { includePast }) as Doc<'events'>[]) || [];
  const registeredEvents =
    (useQuery(api.events.getMyRegisteredEvents, { includePast }) as Doc<'events'>[]) || [];

  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date-asc');
  const [showOnlyRegistered, setShowOnlyRegistered] = useState(false);

  // State for Registration Dialog
  const [selectedEvent, setSelectedEvent] = useState<{
    id: Id<'events'>;
    title: string;
    hasAccessCode: boolean;
  } | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSuccessDialogOpen, setIsSuccessDialogOpen] = useState(false);

  const registeredEventIds = new Set(registeredEvents.map((e: Doc<'events'>) => e._id));

  const handleJoinClick = (event: Doc<'events'>) => {
    setSelectedEvent({
      id: event._id,
      title: event.title,
      hasAccessCode: !!event.accessCode,
    });
    setIsDialogOpen(true);
  };

  const handleRegistrationSuccess = () => {
    setIsSuccessDialogOpen(true);
  };

  const filteredEvents = allEvents.filter((event: Doc<'events'>) => {
    const matchesSearch =
      event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.location.toLowerCase().includes(searchTerm.toLowerCase());

    const isRegistered = registeredEventIds.has(event._id);
    const matchesRegisteredFilter = !showOnlyRegistered || isRegistered;

    return matchesSearch && matchesRegisteredFilter;
  });

  filteredEvents.sort((a: Doc<'events'>, b: Doc<'events'>) => {
    if (sortBy === 'date-asc') return a.startDate - b.startDate;
    if (sortBy === 'date-desc') return b.startDate - a.startDate;
    if (sortBy === 'name') return a.title.localeCompare(b.title);
    return 0;
  });

  const now = Date.now();

  return (
    <div>
      <div className="container mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl mb-2">Events</h1>
          <p className="text-muted-foreground">
            Finde passende Veranstaltungen und verwalte deine Anmeldungen
          </p>
        </div>

        <div data-onboarding-id="events-search-main" className="space-y-6">
          <EventFilters
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            sortBy={sortBy}
            onSortChange={setSortBy}
            showOnlyRegistered={showOnlyRegistered}
            onShowOnlyRegisteredChange={setShowOnlyRegistered}
            includePast={includePast}
            onIncludePastChange={setIncludePast}
          />

          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredEvents.map((event: Doc<'events'>) => {
              const isRegistered = registeredEventIds.has(event._id);
              const isPast = event.endDate < now;
              return (
                <div key={event._id} className={isPast ? 'opacity-75 grayscale-[0.5]' : ''}>
                  <EventCard event={event} isRegistered={isRegistered} onJoin={handleJoinClick} />
                </div>
              );
            })}
            {filteredEvents.length === 0 && (
              <div className="col-span-full text-center py-12 text-muted-foreground bg-muted/50 rounded-lg border-2 border-dashed">
                {showOnlyRegistered
                  ? 'Du bist noch für keine Events angemeldet, die deiner Suche entsprechen.'
                  : 'Keine Events gefunden.'}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedEvent && (
        <EventRegistrationDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          eventId={selectedEvent.id}
          eventTitle={selectedEvent.title}
          hasAccessCode={selectedEvent.hasAccessCode}
          onSuccess={handleRegistrationSuccess}
        />
      )}

      {selectedEvent && (
        <PostRegistrationSuccessDialog
          open={isSuccessDialogOpen}
          onOpenChange={setIsSuccessDialogOpen}
          eventTitle={selectedEvent.title}
          eventId={selectedEvent.id}
        />
      )}
    </div>
  );
}
