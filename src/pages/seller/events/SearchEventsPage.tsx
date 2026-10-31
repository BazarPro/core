import { useQuery, useMutation } from '../../../lib/api/react';
import { api } from '../../../lib/api/functions';

import { Button } from '../../../components/ui/button';
import { ImageWithFallback } from '../../../components/ui/image-with-fallback';
import { CardGridSkeleton, Loading } from '../../../components/ui/loading';
import {
  Calendar,
  MapPin,
  Check,
  Package,
  LogOut,
  Info,
  Megaphone,
  ClipboardList,
  Clock,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Doc, Id } from '../../../lib/api/types';
import { useState } from 'react';
import { EventFilters } from '../../../components/events/EventFilters';
import { EventRegistrationDialog } from '../../../components/events/EventRegistrationDialog';
import { formatDateRangeDE } from '../../../lib/utils';
import { describeSellerSchedule } from '../../../lib/sellerFees';
import { SellerConditions } from '../../../components/events/SellerConditions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
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
import { useTranslation } from 'react-i18next';
import { formatEventPlace } from '../../../shared/eventJsonLd';

function EventCard({
  event,
  isRegistered,
  unreadMessages = 0,
  onJoin,
  onboardingId,
}: {
  event: Doc<'events'>;
  isRegistered: boolean;
  /** New messages of the organizer; they are shown on the bazaar page */
  unreadMessages?: number;
  onJoin: (event: Doc<'events'>) => void;
  onboardingId?: string;
}) {
  const { t } = useTranslation('events');
  const navigate = useNavigate();
  const productCount = useQuery(
    api.events.getMyProductCountForEvent,
    isRegistered ? { eventId: event._id } : 'skip'
  );
  const sellerNumber = useQuery(
    api.sellerNumbers.getMySellerNumber,
    isRegistered ? { eventId: event._id } : 'skip'
  );
  const leaveEvent = useMutation(api.events.leaveEvent);
  const [showConditions, setShowConditions] = useState(false);

  const handleLeave = async () => {
    try {
      await leaveEvent({ eventId: event._id });
      toast.success(t('search.left', { event: event.title }));
    } catch (error) {
      console.error(error);
      const description = getUserFacingErrorMessage(error, {
        fallback: t('search.unknownError'),
      });
      toast.error(t('search.leaveFailed'), { description });
    }
  };

  const productCountLabel =
    productCount !== undefined ? t('search.products', { count: productCount }) : '…';
  const schedule = isRegistered ? describeSellerSchedule(event).rows : [];

  return (
    <div
      data-onboarding-id={onboardingId}
      className="bg-card rounded-lg border overflow-hidden hover:shadow-lg transition-shadow flex flex-col h-full"
    >
      <div className="aspect-video overflow-hidden relative">
        <ImageWithFallback
          storageId={event.coverImage}
          alt={event.title}
          className="w-full h-full object-cover"
        />
        {isRegistered && (
          <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded-md text-sm font-medium flex items-center gap-1 shadow-sm">
            <Check className="h-4 w-4" /> {t('search.registered')}
            {sellerNumber ? ` · ${t('search.sellerNumber', { number: sellerNumber })}` : ''}
          </div>
        )}
      </div>
      <div className="p-6 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-2 gap-2">
          <h3 className="text-xl font-bold line-clamp-2 break-words" title={event.title}>
            {event.title}
          </h3>
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
            <span className="text-muted-foreground line-clamp-2" title={formatEventPlace(event)}>
              {formatEventPlace(event)}
            </span>
          </div>
          {schedule.map((row) => (
            <div key={row.label} className="flex items-start gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <span className="text-muted-foreground">
                <span className="font-medium text-foreground">{row.label}:</span> {row.value}
              </span>
            </div>
          ))}
          {unreadMessages > 0 && (
            <button
              onClick={() =>
                navigate(`/public-events/${event._id}`, { state: { from: '/browse-events' } })
              }
              className="flex items-center gap-2 text-sm font-medium text-destructive hover:underline"
            >
              <Megaphone className="h-4 w-4" />
              {t('search.newMessages', { count: unreadMessages })}
            </button>
          )}
          {isRegistered && (
            <button
              onClick={() => setShowConditions(true)}
              className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              <ClipboardList className="h-4 w-4" />
              {t('search.conditions')}
            </button>
          )}
          {isRegistered && (
            <button
              onClick={() => navigate('/my-products', { state: { filterEvent: event._id } })}
              className="flex items-center gap-2 text-sm font-medium text-primary hover:underline transition-all cursor-pointer"
            >
              <Package className="h-4 w-4" />
              <span>{t('search.productsAndLabels', { products: productCountLabel })}</span>
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
            {t('search.details')}
          </Button>
          {!isRegistered ? (
            <Button className="flex-1" onClick={() => onJoin(event)}>
              {t('search.join')}
            </Button>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={t('search.leaveLabel')}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('search.leaveTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('search.leaveConfirm', { event: event.title })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('actions.cancel', { ns: 'common' })}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleLeave}>{t('search.leave')}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
      <Dialog open={showConditions} onOpenChange={setShowConditions}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{event.title}</DialogTitle>
            <DialogDescription>{t('search.conditionsIntro')}</DialogDescription>
          </DialogHeader>
          <SellerConditions event={event} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function SearchEventsPage() {
  const { t } = useTranslation('events');
  const [includePast, setIncludePast] = useState(false);
  const allEvents = useQuery(api.events.get, { includePast }) as Doc<'events'>[] | undefined;
  const registeredEvents = useQuery(api.events.getMyRegisteredEvents, { includePast }) as
    | Doc<'events'>[]
    | undefined;
  const unreadMessages = useQuery(api.broadcasts.getMyUnreadMessages, {}) ?? {};

  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date-asc');

  // State for Registration Dialog
  const [selectedEvent, setSelectedEvent] = useState<{
    id: Id<'events'>;
    title: string;
    hasAccessCode: boolean;
    conditions: Doc<'events'>;
  } | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSuccessDialogOpen, setIsSuccessDialogOpen] = useState(false);

  const handleJoinClick = (event: Doc<'events'>) => {
    setSelectedEvent({
      id: event._id,
      title: event.title,
      hasAccessCode: !!event.accessCode,
      conditions: event,
    });
    setIsDialogOpen(true);
  };

  const handleRegistrationSuccess = () => {
    setIsSuccessDialogOpen(true);
  };

  const now = Date.now();
  const isLoading = allEvents === undefined || registeredEvents === undefined;
  const registeredEventIds = new Set(registeredEvents?.map((event) => event._id));
  const myEvents = [...(registeredEvents ?? [])].sort((a, b) => a.startDate - b.startDate);

  const search = searchTerm.toLowerCase();
  const newEvents = (allEvents ?? []).filter(
    (event) =>
      !registeredEventIds.has(event._id) &&
      (event.title.toLowerCase().includes(search) ||
        event.description.toLowerCase().includes(search) ||
        formatEventPlace(event).toLowerCase().includes(search))
  );
  newEvents.sort((a, b) => {
    if (sortBy === 'date-asc') return a.startDate - b.startDate;
    if (sortBy === 'date-desc') return b.startDate - a.startDate;
    if (sortBy === 'name') return a.title.localeCompare(b.title);
    return 0;
  });

  const renderCard = (event: Doc<'events'>, onboardingId?: string) => (
    <div key={event._id} className={event.endDate < now ? 'opacity-75 grayscale-[0.5]' : ''}>
      <EventCard
        event={event}
        isRegistered={registeredEventIds.has(event._id)}
        unreadMessages={unreadMessages[event._id]?.count}
        onJoin={handleJoinClick}
        onboardingId={onboardingId}
      />
    </div>
  );

  return (
    <div>
      <div className="container mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl mb-2">{t('search.title')}</h1>
          <p className="text-muted-foreground">{t('search.subtitle')}</p>
        </div>

        <div data-onboarding-id="events-search-main" className="space-y-10">
          {isLoading ? (
            <Loading>
              <CardGridSkeleton className="xl:grid-cols-3 lg:grid-cols-2 gap-6" />
            </Loading>
          ) : (
            <>
              {myEvents.length > 0 && (
                <section aria-labelledby="my-events-heading" className="space-y-4">
                  <h2 id="my-events-heading" className="text-2xl font-semibold">
                    {t('search.mine')}
                  </h2>
                  <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-6">
                    {myEvents.map((event) => renderCard(event))}
                  </div>
                </section>
              )}

              <section aria-labelledby="new-events-heading" className="space-y-4">
                <h2 id="new-events-heading" className="text-2xl font-semibold">
                  {t('search.discover')}
                </h2>
                <EventFilters
                  searchTerm={searchTerm}
                  onSearchChange={setSearchTerm}
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                  includePast={includePast}
                  onIncludePastChange={setIncludePast}
                />
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-6">
                  {newEvents.map((event, index) =>
                    renderCard(event, index === 0 ? 'events-search-first-card' : undefined)
                  )}
                  {newEvents.length === 0 && (
                    <div className="col-span-full text-center py-12 text-muted-foreground bg-muted/50 rounded-lg border-2 border-dashed">
                      {searchTerm ? t('search.none') : t('search.noneNew')}
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      {selectedEvent && (
        <EventRegistrationDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          eventId={selectedEvent.id}
          eventTitle={selectedEvent.title}
          hasAccessCode={selectedEvent.hasAccessCode}
          conditions={selectedEvent.conditions}
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
