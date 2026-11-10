import { EmptyState } from '../../components/ui/empty-state';
import { PageHeader } from '../../components/ui/page-header';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  AlertTriangle,
  Calendar,
  CalendarPlus,
  FilePen,
  ChevronDown,
  MapPin,
  Package,
  Printer,
  Receipt,
  Search,
} from 'lucide-react';
import { useQuery } from '../../lib/api/react';
import { api } from '../../lib/api/functions';
import type { Doc, FunctionReturnType } from '../../lib/api/types';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { NextSteps, type NextStep } from '../../components/ui/next-steps';
import { Card, CardContent } from '../../components/ui/card';
import { StorageImage } from '../../components/ui/StorageImage';
import { ListSkeleton, Loading, PageSkeleton } from '../../components/ui/loading';
import { Skeleton } from '../../components/ui/skeleton';
import { useUserRole, type UserRole } from '../../context/UserRoleContext';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { useInstanceConfig } from '../../hooks/useInstanceConfig';
import { useMarkNoticesSeen } from '../../hooks/useMarkNoticesSeen';
import { selectedOrCurrent, useSelectedEventId } from '../../lib/selectedEvent';
import { formatDateRangeDE, formatDateTimeDE, formatPriceDE } from '../../lib/utils';
import { AdminOverviewPage } from '../administrator/AdminOverviewPage';
import { formatEventPlace } from '../../shared/eventJsonLd';
import { EventApprovalBadge } from '../../components/events/EventApprovalBadge';
import { eventApproval } from '../../lib/eventApproval';
import { eventDraftTitle } from '../../lib/eventDraft';
import { useNowPassing } from '../../hooks/useNowPassing';

/**
 * Start page for signed-in users (#158), one per role of the role switch: sellers see
 * their next bazaar, organizers their own bazaars, admins the admin overview. Switching
 * the role on this page swaps the content in place. Visitors get the landing page.
 */
export function DashboardPage() {
  const { role } = useUserRole();
  const access = useQuery(api.instance.getMyAccess, {});
  const isAdmin = useQuery(api.moderation.isViewerAdmin, {}) ?? false;
  const user = useQuery(api.users.viewer);

  // A remembered role the account no longer has falls back to selling
  const shown: UserRole =
    (role === 'organizer' && access && !access.canOrganize) ||
    (role === 'administrator' && !isAdmin)
      ? 'participant'
      : role;

  if (!user) {
    return <PageSkeleton className="max-w-5xl" />;
  }

  return (
    // The key restarts the fade when the role changes
    <div key={shown} className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      {shown === 'administrator' ? (
        <AdminOverviewPage />
      ) : (
        <div className="container mx-auto max-w-5xl space-y-8">
          <Greeting name={user.firstName || user.name} />
          {shown === 'organizer' ? (
            <OrganizerOverview canCreate={access?.canCreateEvents ?? false} />
          ) : (
            <SellerOverview />
          )}
        </div>
      )}
    </div>
  );
}

function Greeting({ name }: { name?: string }) {
  const { t } = useTranslation('dashboard');
  const { isDemoMode } = useFeatureFlags();
  return (
    <div className="space-y-3">
      <PageHeader title={name ? t('greeting', { name }) : t('greetingAnonymous')} />
      {/* The banner of the landing page would push the page under the sidebar */}
      {isDemoMode && (
        <p className="flex items-center gap-2 rounded-lg bg-yellow-500/15 text-yellow-900 dark:text-yellow-200 px-3 py-2 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {t('header.demoMode', { ns: 'common' })}
        </p>
      )}
    </div>
  );
}

function SellerOverview() {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const { isSingle } = useInstanceConfig();
  const registered = useQuery(api.events.getMyRegisteredEvents, {});
  const products = useQuery(api.products.getMyProducts);
  const sales = useQuery(api.purchases.getMySales, {});

  const upcoming = upcomingFirst(registered);
  const [next, ...more] = upcoming;

  if (registered === undefined) {
    return (
      <Loading>
        <Skeleton className="h-48 rounded-xl" />
      </Loading>
    );
  }
  const count = next
    ? // Sold ones were announced as well: they must not read as "no items yet"
      (products ?? []).filter((product) => product.eventIds?.includes(next._id)).length
    : 0;
  const seller = next ? sales?.find((group) => group.event._id === next._id) : undefined;
  const started = !!next && next.startDate <= Date.now();
  const dropoff = next?.sellerLogistics?.dropoffStart;

  // The way through a bazaar; the first open step is the one to do now
  const steps: NextStep[] = [
    {
      id: 'register',
      icon: Search,
      title: next ? t('steps.registered') : t('steps.register'),
      text: next
        ? seller?.sellerNumber !== undefined
          ? t('nextBazaar.sellerNumber', { number: seller.sellerNumber })
          : undefined
        : isSingle
          ? t('nextBazaar.noneSingle')
          : t('nextBazaar.none'),
      to: next ? undefined : '/browse-events',
      done: !!next,
    },
    {
      id: 'products',
      icon: Package,
      title: t('steps.products'),
      text: count > 0 ? t('nextBazaar.products', { count }) : t('nextBazaar.noProducts'),
      to: count > 0 ? '/my-products' : '/products/new',
      state: count > 0 ? { filterEvent: next?._id } : undefined,
      done: count > 0,
    },
    {
      id: 'labels',
      icon: Printer,
      title: t('steps.labels'),
      text: dropoff
        ? t('steps.dropoff', { date: formatDateTimeDE(dropoff) })
        : t('steps.labelsText'),
      to: '/my-products',
      state: next ? { filterEvent: next._id } : undefined,
      // Only with items there was something to hand in
      done: started && count > 0,
    },
    {
      id: 'payout',
      icon: Receipt,
      title: t('steps.payout'),
      text: [salesSummary(sales, t), seller?.paid && t('nextBazaar.paid')]
        .filter(Boolean)
        .join(' · '),
      to: '/my-sales',
      done: !!seller?.paid,
    },
  ];
  const current = next ? steps.find((step) => !step.done) : steps[0];
  if (current) current.current = true;

  return (
    <>
      {next && (
        <BazaarHero
          event={next}
          label={t('nextBazaar.title')}
          actions={
            <Button variant="outline" onClick={() => navigate(`/public-events/${next._id}`)}>
              {t('nextBazaar.openEvent')}
            </Button>
          }
          footer={
            more.length > 0 && (
              <Link
                to="/browse-events"
                className="text-muted-foreground hover:text-foreground underline"
              >
                {t('nextBazaar.more', { count: more.length })}
              </Link>
            )
          }
        />
      )}
      <NextSteps title={t('steps.title')} steps={steps} />
    </>
  );
}

/**
 * Everything of the organizer's events in one place (the former "Meine Events"): the
 * chosen event big, the other upcoming ones to choose from, the past ones folded away.
 */
function OrganizerOverview({ canCreate }: { canCreate: boolean }) {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  useMarkNoticesSeen('events');
  const events = useQuery(api.events.getMyEvents, { includePast: true });
  const draft = useQuery(api.events.getMyEventDraft, {});
  const roles = useQuery(
    api.eventRoles.getMyRolesForEvents,
    events ? { eventIds: events.map((event) => event._id) } : 'skip'
  );
  const selectedId = useSelectedEventId();
  const [showAll, setShowAll] = useState(false);
  const [showPast, setShowPast] = useState(false);

  if (!events) {
    return (
      <Loading className="space-y-8">
        <Skeleton className="h-48 rounded-xl" />
        <ListSkeleton rows={3} />
      </Loading>
    );
  }
  const isHelper = (event: Doc<'events'>) => {
    const own = roles?.find((entry) => entry.eventId === event._id)?.roles ?? [];
    return own.includes('coorganizer') && !own.includes('organizer');
  };
  const selected = selectedOrCurrent(events, selectedId);
  const now = Date.now();
  const others = events.filter((event) => event._id !== selected?._id);
  const upcoming = upcomingFirst(others);
  const past = others
    .filter((event) => event.endDate < now)
    .sort((a, b) => b.startDate - a.startDate);
  const shownUpcoming = showAll ? upcoming : upcoming.slice(0, VISIBLE_UPCOMING);

  // Opening a bazaar also makes it the chosen one (ResponsiveSidebar)
  const open = (event: Doc<'events'>) => navigate(`/events/view/${event._id}`);

  const createButton = canCreate && (
    <Button onClick={() => navigate('/events/new')} data-onboarding-id="my-events-new-event-button">
      <CalendarPlus className="mr-2 h-4 w-4" />
      {t('myEvents.new', { ns: 'organizer' })}
    </Button>
  );

  // The bazaar being prepared comes first: it is the one thing still to finish
  const draftCard = draft && (
    <DraftCard
      title={eventDraftTitle(draft.draft)}
      savedAt={draft.updatedAt}
      onContinue={() => navigate('/events/new')}
    />
  );

  if (!selected) {
    return draftCard ? (
      draftCard
    ) : (
      <EmptyState title={t('myEvents.none', { ns: 'organizer' })}>{createButton}</EmptyState>
    );
  }

  return (
    <>
      {draftCard}
      <BazaarHero
        testId="current-event"
        event={selected}
        label={t('organizer.current')}
        badges={
          <>
            <EventApprovalBadge event={selected} />
            {isHelper(selected) && (
              <Badge variant="outline">{t('myEvents.helper', { ns: 'organizer' })}</Badge>
            )}
            {selected.endDate < now && (
              <Badge variant="secondary">{t('myEvents.ended', { ns: 'organizer' })}</Badge>
            )}
          </>
        }
        note={<ApprovalNote event={selected} />}
        actions={
          <Button onClick={() => navigate(`/events/view/${selected._id}`)}>
            {t('myEvents.open', { ns: 'organizer' })}
          </Button>
        }
      />

      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('organizer.later')}</h2>
          {createButton}
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('organizer.none')}</p>
        ) : (
          <EventList events={shownUpcoming} isHelper={isHelper} onOpen={open} />
        )}
        {upcoming.length > VISIBLE_UPCOMING && (
          <Button variant="ghost" size="sm" onClick={() => setShowAll((open) => !open)}>
            <ChevronDown
              className={`mr-2 h-4 w-4 transition-transform ${showAll ? 'rotate-180' : ''}`}
            />
            {showAll ? t('organizer.showLess') : t('organizer.showAll', { count: upcoming.length })}
          </Button>
        )}
      </section>

      {past.length > 0 && (
        <section className="space-y-3">
          <Button
            variant="ghost"
            className="px-0 text-lg font-semibold hover:bg-transparent"
            aria-expanded={showPast}
            onClick={() => setShowPast((open) => !open)}
          >
            <ChevronDown
              className={`mr-2 h-5 w-5 transition-transform ${showPast ? 'rotate-180' : ''}`}
            />
            {t('organizer.past', { count: past.length })}
          </Button>
          {showPast && <EventList events={past} isHelper={isHelper} onOpen={open} />}
        </section>
      )}
    </>
  );
}

/** A bazaar saved half way through the creation wizard (#257). */
function DraftCard({
  title,
  savedAt,
  onContinue,
}: {
  title?: string;
  savedAt: number;
  onContinue: () => void;
}) {
  const { t } = useTranslation('organizer');
  return (
    <Card data-testid="event-draft" className="border-dashed">
      <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <FilePen className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium break-words">{title ?? t('myEvents.draftUntitled')}</p>
              <Badge variant="secondary">{t('myEvents.draft')}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('myEvents.draftSaved', { date: formatDateTimeDE(savedAt) })}
            </p>
          </div>
        </div>
        <Button className="shrink-0" onClick={onContinue}>
          {t('myEvents.draftContinue')}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Upcoming events shown before "show all" */
const VISIBLE_UPCOMING = 3;

function EventList({
  events,
  isHelper,
  onOpen,
}: {
  events: Doc<'events'>[];
  isHelper: (event: Doc<'events'>) => boolean;
  onOpen: (event: Doc<'events'>) => void;
}) {
  const { t } = useTranslation('dashboard');
  return (
    <Card>
      <CardContent className="py-2">
        <ul className="divide-y">
          {events.map((event) => (
            <li
              key={event._id}
              className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
            >
              <div className="min-w-0 space-y-1">
                <p className="font-medium break-words">{event.title}</p>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>{formatDateRangeDE(event.startDate, event.endDate)}</span>
                  <EventApprovalBadge event={event} />
                  {isHelper(event) && (
                    <Badge variant="outline">{t('myEvents.helper', { ns: 'organizer' })}</Badge>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => onOpen(event)}
              >
                {t('organizer.open')}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ApprovalNote({ event }: { event: Doc<'events'> }) {
  const { t } = useTranslation('dashboard');
  const approval = eventApproval(event);
  if (approval === 'rejected' && event.rejectionReason) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
        <div className="text-xs font-medium uppercase tracking-wide text-destructive">
          {t('myEvents.rejected', { ns: 'organizer' })}
        </div>
        <div className="mt-1 text-sm whitespace-pre-line">{event.rejectionReason}</div>
      </div>
    );
  }
  if (approval === 'pending') {
    return (
      <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
        {t('myEvents.reviewing', { ns: 'organizer' })}
      </div>
    );
  }
  return null;
}

/** Not over yet, the next one first. */
function upcomingFirst(events: Doc<'events'>[] | undefined): Doc<'events'>[] {
  const now = Date.now();
  return (events ?? [])
    .filter((event) => event.endDate >= now)
    .sort((a, b) => a.startDate - b.startDate);
}

type SalesGroups = FunctionReturnType<typeof api.purchases.getMySales> | undefined;

function salesSummary(sales: SalesGroups, t: TFunction<'dashboard'>): string {
  const sold = (sales ?? []).reduce((sum, group) => sum + group.items.length, 0);
  if (sold === 0) return t('seller.noSales');
  const payout = (sales ?? []).reduce((sum, group) => sum + group.totals.payout, 0);
  return t('seller.sales', { count: sold, payout: formatPriceDE(payout) });
}

/** The next bazaar with its cover picture, full title, date and place. */
function BazaarHero({
  event,
  label,
  badges,
  note,
  actions,
  footer,
  testId,
}: {
  event: Doc<'events'>;
  label: string;
  badges?: ReactNode;
  /** E.g. why the event was rejected */
  note?: ReactNode;
  actions: ReactNode;
  footer?: ReactNode;
  testId?: string;
}) {
  const { t } = useTranslation('dashboard');
  // A picture that does not load leaves no empty box (e.g. a deleted file)
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const running = event.startDate <= useNowPassing([event.startDate]);
  return (
    <Card className="overflow-hidden sm:flex" data-testid={testId}>
      {event.coverImage && event.coverImage !== failedImage && (
        <StorageImage
          storageId={event.coverImage}
          alt=""
          className="h-40 w-full object-cover sm:h-auto sm:w-2/5 sm:min-h-52"
          onError={() => setFailedImage(event.coverImage ?? null)}
        />
      )}
      <CardContent className="min-w-0 flex-1 space-y-3 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{label}</span>
          {running && <Badge>{t('nextBazaar.running')}</Badge>}
          {badges}
        </div>
        {/* Full title: long names of bazaars wrap instead of being cut off */}
        <h2 className="text-xl font-semibold break-words sm:text-2xl">{event.title}</h2>
        <div className="space-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <Calendar className="h-4 w-4 shrink-0" />
            {formatDateRangeDE(event.startDate, event.endDate)}
          </span>
          {event.location && (
            <span className="flex items-center gap-2 min-w-0">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="break-words">{formatEventPlace(event)}</span>
            </span>
          )}
        </div>
        {note}
        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap">{actions}</div>
        {footer && <p className="text-sm">{footer}</p>}
      </CardContent>
    </Card>
  );
}
