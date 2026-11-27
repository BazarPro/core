import { PageHeader } from '../../../components/ui/page-header';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { useQuery, useMutation } from '../../../lib/api/react';
import { api } from '../../../lib/api/functions';

import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { LabelPrintDialog } from '../../../components/products/LabelPrintDialog';
import { CardGridSkeleton, Loading } from '../../../components/ui/loading';
import { Check, Package, LogOut, Search, Megaphone, Clock, Ban, Printer } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Doc, Exclusion, Id } from '../../../lib/api/types';
import { useState } from 'react';
import {
  BazaarFilters,
  BazaarResultCard,
  BazaarResultsHeading,
  BazaarSearchBar,
  BazaarSearchEmpty,
} from '../../../components/events/BazaarSearch';
import { useBazaarSearch } from '../../../hooks/useBazaarSearch';
import { EventRegistrationDialog } from '../../../components/events/EventRegistrationDialog';
import { cn, formatDateDE } from '../../../lib/utils';
import { describeSellerSchedule } from '../../../lib/sellerFees';
import { toast } from 'sonner';
import { getUserFacingErrorMessage } from '../../../lib/errors';
import { PostRegistrationSuccessDialog } from '../../../components/events/PostRegistrationSuccessDialog';
import { useTranslation } from 'react-i18next';
import { describeRegistration } from '../../../components/participation/registrationText';
import { useMarkNoticesSeen } from '../../../hooks/useMarkNoticesSeen';
import { isEventOver } from '../../../shared/eventPhase';

/**
 * A bazaar the seller joined, in the same card as the search results: below the date and
 * place what matters to them there, news first, then their items and hand-in time. The
 * one button leads to the items; labels and leaving sit beside it.
 */
function OwnBazaarCard({
  event,
  exclusion,
  unreadMessages = 0,
  onPrintLabels,
  onboardingId,
}: {
  event: Doc<'events'>;
  /** The organizer took the seller out: no leaving, the notice is on the bazaar page */
  exclusion?: Exclusion;
  /** New messages of the organizer; they are shown on the bazaar page */
  unreadMessages?: number;
  onPrintLabels: (event: Doc<'events'>) => void;
  onboardingId?: string;
}) {
  const { t } = useTranslation('events');
  const productCount = useQuery(api.events.getMyProductCountForEvent, { eventId: event._id });
  const sellerNumber = useQuery(
    api.sellerNumbers.getMySellerNumber,
    exclusion ? 'skip' : { eventId: event._id }
  );
  const leaveEvent = useMutation(api.events.leaveEvent);
  const over = isEventOver(event, Date.now());

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

  const schedule = describeSellerSchedule(event).rows;
  const page = `/public-events/${event._id}`;
  const products = { filterEvent: event._id };
  const line = 'flex items-start gap-2';
  // Links in the card lie above its link to the bazaar page
  const link = 'relative z-10 font-medium hover:underline';

  return (
    <div data-onboarding-id={onboardingId} className="h-full">
      <BazaarResultCard
        found={{ event }}
        from="/browse-events"
        badge={
          exclusion ? (
            <Badge variant="destructive">
              <Ban /> {t('search.excluded')}
            </Badge>
          ) : (
            <Badge variant="success">
              <Check /> {t('search.registered')}
              {sellerNumber ? ` · ${t('search.sellerNumber', { number: sellerNumber })}` : ''}
            </Badge>
          )
        }
        status={
          <ul className="space-y-1.5 rounded-xl bg-muted/50 p-3 text-sm">
            {exclusion && (
              <li className={cn(line, 'text-destructive')}>
                <Ban className="mt-0.5 size-4 shrink-0" />
                {t('search.excludedSince', { date: formatDateDE(exclusion.excludedAt) })}
              </li>
            )}
            {unreadMessages > 0 && (
              <li className={line}>
                <Megaphone className="mt-0.5 size-4 shrink-0 text-primary" />
                <Link
                  to={page}
                  state={{ from: '/browse-events' }}
                  className={cn(link, 'text-primary')}
                >
                  {t('search.newMessages', { count: unreadMessages })}
                </Link>
              </li>
            )}
            <li className={line}>
              <Package className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <Link to="/my-products" state={products} className={cn(link, 'text-primary')}>
                {productCount === undefined ? '…' : t('search.products', { count: productCount })}
              </Link>
            </li>
            {schedule.map((row) => (
              <li key={row.label} className={cn(line, 'text-muted-foreground')}>
                <Clock className="mt-0.5 size-4 shrink-0" />
                <span>
                  <span className="font-medium text-foreground">{row.label}:</span> {row.value}
                </span>
              </li>
            ))}
          </ul>
        }
        actions={
          <>
            <Button asChild className="flex-1">
              <Link to="/my-products" state={products}>
                {t('search.myItems')}
              </Link>
            </Button>
            {!over && !exclusion && (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t('search.printLabels')}
                  title={t('search.printLabels')}
                  disabled={!productCount}
                  onClick={() => onPrintLabels(event)}
                >
                  <Printer className="size-4" />
                </Button>
                <ConfirmDialog
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={t('search.leaveLabel')}
                      title={t('search.leaveLabel')}
                    >
                      <LogOut className="size-4" />
                    </Button>
                  }
                  title={t('search.leaveTitle')}
                  description={t('search.leaveConfirm', { event: event.title })}
                  confirmLabel={t('search.leave')}
                  onConfirm={handleLeave}
                  destructive
                />
              </>
            )}
          </>
        }
      />
    </div>
  );
}

export function SearchEventsPage() {
  const { t } = useTranslation('events');
  const allEvents = useQuery(api.events.get, { includePast: true }) as Doc<'events'>[] | undefined;
  const categories = useQuery(api.categories.getAllCategories, {});
  const search = useBazaarSearch(allEvents, categories);
  // Only the search looks into the past; the own bazaars are those still to come
  const includePast = false;
  const registeredEvents = useQuery(api.events.getMyRegisteredEvents, { includePast }) as
    | Doc<'events'>[]
    | undefined;
  const unreadMessages = useQuery(api.broadcasts.getMyUnreadMessages, {}) ?? {};
  const excludedEvents = useQuery(api.eventExclusions.getMyExcludedEvents, { includePast });
  // The excluded bazaars are right here among the seller's own
  useMarkNoticesSeen('participation');

  // State for Registration Dialog
  const [selectedEvent, setSelectedEvent] = useState<{
    id: Id<'events'>;
    title: string;
    hasAccessCode: boolean;
    conditions: Doc<'events'>;
  } | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const myProducts = useQuery(api.products.getMyProducts);
  const [labelsFor, setLabelsFor] = useState<Id<'events'>>();
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
  const isLoading =
    allEvents === undefined || registeredEvents === undefined || excludedEvents === undefined;
  const registeredEventIds = new Set(registeredEvents?.map((event) => event._id));
  const exclusions = new Map(excludedEvents?.map(({ event, exclusion }) => [event._id, exclusion]));
  // Excluded with items handed in, they are still a seller: listed once
  const myEvents = [
    ...(registeredEvents ?? []),
    ...(excludedEvents ?? [])
      .map(({ event }) => event)
      .filter((event) => !registeredEventIds.has(event._id)),
  ].sort((a, b) => a.startDate - b.startDate);

  // The search finds new bazaars; the own ones stand above it
  const found = search.results?.filter(
    ({ event }) => !registeredEventIds.has(event._id) && !exclusions.has(event._id)
  );

  const renderCard = (event: Doc<'events'>, onboardingId?: string) => (
    <OwnBazaarCard
      key={event._id}
      event={event}
      exclusion={exclusions.get(event._id)}
      unreadMessages={unreadMessages[event._id]?.count}
      onPrintLabels={(bazaar) => setLabelsFor(bazaar._id)}
      onboardingId={onboardingId}
    />
  );

  return (
    <div>
      <div className="page-wide">
        <PageHeader
          title={t('search.title')}
          className="mb-8"
          actions={
            myEvents.length > 0 && (
              // With own bazaars on top, finding a new one is one tap away
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  const heading = document.getElementById('new-events-heading');
                  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
                  heading?.scrollIntoView({ behavior: still ? 'auto' : 'smooth' });
                  heading?.parentElement
                    ?.querySelector<HTMLInputElement>('input')
                    ?.focus({ preventScroll: true });
                }}
              >
                <Search className="h-4 w-4" />
                {t('search.findNew')}
              </Button>
            )
          }
        />

        <div data-onboarding-id="events-search-main" className="space-y-10">
          {isLoading ? (
            <Loading>
              <CardGridSkeleton className="xl:grid-cols-3 lg:grid-cols-2 gap-6" />
            </Loading>
          ) : (
            <>
              {myEvents.length > 0 && (
                <section aria-labelledby="my-events-heading" className="space-y-4">
                  <h2 id="my-events-heading" className="text-lg font-semibold">
                    {t('search.mine')}
                  </h2>
                  <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                    {myEvents.map((event) => renderCard(event))}
                  </div>
                </section>
              )}

              <section aria-labelledby="new-events-heading" className="space-y-4">
                {/* Only needed to tell it apart from the own bazaars above */}
                <h2
                  id="new-events-heading"
                  className={myEvents.length > 0 ? 'text-lg font-semibold' : 'sr-only'}
                >
                  {t('search.discover')}
                </h2>
                <BazaarSearchBar search={search} />
                <BazaarFilters search={search} categories={categories} />
                <BazaarResultsHeading search={{ ...search, results: found }} />
                {found && found.length > 0 ? (
                  <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                    {found.map((result, index) => {
                      const closed = describeRegistration(result.event, now).blocked;
                      return (
                        <div
                          key={result.event._id}
                          data-onboarding-id={index === 0 ? 'events-search-first-card' : undefined}
                        >
                          <BazaarResultCard
                            found={result}
                            from={`/browse-events${window.location.search}`}
                            actions={
                              !isEventOver(result.event, now) && (
                                // Outlined: one blue button per card made the whole page shout
                                <Button
                                  variant="outline"
                                  className="flex-1"
                                  disabled={!!closed}
                                  onClick={() => handleJoinClick(result.event)}
                                >
                                  {closed ?? t('search.join')}
                                </Button>
                              )
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <BazaarSearchEmpty
                    search={search}
                    noneText={t('search.noneNew')}
                    hidden={(search.results?.length ?? 0) - (found?.length ?? 0)}
                  />
                )}
              </section>
            </>
          )}
        </div>
      </div>

      {registeredEvents && myProducts && (
        <LabelPrintDialog
          open={labelsFor !== undefined}
          onOpenChange={(open) => !open && setLabelsFor(undefined)}
          events={registeredEvents}
          products={myProducts}
          eventId={labelsFor}
        />
      )}

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
