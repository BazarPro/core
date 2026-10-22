import { useState, type ComponentType, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  AlertTriangle,
  Calendar,
  CalendarPlus,
  ChevronDown,
  MapPin,
  Package,
  Plus,
  Receipt,
  Search,
  ShoppingCart,
  Users,
} from 'lucide-react';
import { useQuery } from '../../lib/api/react';
import { api } from '../../lib/api/functions';
import type { Doc, FunctionReturnType } from '../../lib/api/types';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { StorageImage } from '../../components/ui/StorageImage';
import { useUserRole, type UserRole } from '../../context/UserRoleContext';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { useInstanceConfig } from '../../hooks/useInstanceConfig';
import { useMarkNoticesSeen } from '../../hooks/useMarkNoticesSeen';
import { selectEvent, selectedOrCurrent, useSelectedEventId } from '../../lib/selectedEvent';
import { formatDateRangeDE, formatPriceDE } from '../../lib/utils';
import { AdminOverviewPage } from '../administrator/AdminOverviewPage';

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
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
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
      <div>
        <h1 className="text-3xl md:text-4xl mb-2">
          {name ? t('greeting', { name }) : t('greetingAnonymous')}
        </h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>
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
  const notices = useQuery(api.notifications.getUnreadNoticeCounts, {});

  const upcoming = upcomingFirst(registered);
  const available = (products ?? []).filter((product) => !product.sold);
  const [next, ...more] = upcoming;
  const count = next
    ? available.filter((product) => product.eventIds?.includes(next._id)).length
    : 0;
  const seller = next ? sales?.find((group) => group.event._id === next._id) : undefined;

  return (
    <>
      {next ? (
        <BazaarHero
          event={next}
          label={t('nextBazaar.title')}
          badges={
            <>
              <Badge variant="secondary">
                {count > 0 ? t('nextBazaar.products', { count }) : t('nextBazaar.noProducts')}
              </Badge>
              {seller?.sellerNumber !== undefined && (
                <Badge variant="secondary">
                  {t('nextBazaar.sellerNumber', { number: seller.sellerNumber })}
                </Badge>
              )}
              {seller?.paid && <Badge variant="secondary">{t('nextBazaar.paid')}</Badge>}
            </>
          }
          actions={
            <>
              <Button
                onClick={() => navigate('/my-products', { state: { filterEvent: next._id } })}
              >
                <Package className="mr-2 h-4 w-4" />
                {t('nextBazaar.manageProducts')}
              </Button>
              <Button variant="outline" onClick={() => navigate(`/public-events/${next._id}`)}>
                {t('nextBazaar.openEvent')}
              </Button>
            </>
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
      ) : (
        <Card>
          <CardContent className="py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-muted-foreground">
              {isSingle ? t('nextBazaar.noneSingle') : t('nextBazaar.none')}
            </p>
            <Button onClick={() => navigate('/browse-events')}>
              <Search className="mr-2 h-4 w-4" />
              {t('nextBazaar.find')}
            </Button>
          </CardContent>
        </Card>
      )}

      <Section title={t('seller.title')}>
        <Tile
          to="/my-products"
          icon={Package}
          title={t('menu.myProducts', { ns: 'common' })}
          text={t('seller.products', { count: available.length })}
          badge={notices?.products}
        />
        <Tile
          to="/my-sales"
          icon={Receipt}
          title={t('menu.mySales', { ns: 'common' })}
          text={salesSummary(sales, t)}
          badge={notices?.sales}
        />
        <Tile
          to="/browse-events"
          icon={Search}
          title={
            isSingle
              ? t('menu.currentBazaar', { ns: 'common' })
              : t('menu.events', { ns: 'common' })
          }
          text={t('seller.events')}
          badge={notices?.messages}
        />
        <Tile
          to="/products/new"
          icon={Plus}
          title={t('seller.newProduct')}
          text={t('seller.newProductText')}
        />
      </Section>

      {!isSingle && (
        <p className="text-sm text-center">
          <Link to="/features" className="text-muted-foreground hover:text-foreground underline">
            {t('aboutBazarPro')}
          </Link>
        </p>
      )}
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
  const roles = useQuery(
    api.eventRoles.getMyRolesForEvents,
    events ? { eventIds: events.map((event) => event._id) } : 'skip'
  );
  const selectedId = useSelectedEventId();
  const [showAll, setShowAll] = useState(false);
  const [showPast, setShowPast] = useState(false);

  if (!events) return null;
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

  const choose = (event: Doc<'events'>) => {
    selectEvent(event._id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const createButton = canCreate && (
    <Button onClick={() => navigate('/events/new')} data-onboarding-id="my-events-new-event-button">
      <CalendarPlus className="mr-2 h-4 w-4" />
      {t('myEvents.new', { ns: 'organizer' })}
    </Button>
  );

  if (!selected) {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-3">
          <h2 className="text-xl font-semibold">{t('myEvents.none', { ns: 'organizer' })}</h2>
          <p className="text-muted-foreground">{t('myEvents.createFirst', { ns: 'organizer' })}</p>
          {createButton}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <BazaarHero
        testId="current-event"
        event={selected}
        label={t('organizer.current')}
        badges={
          <>
            <ApprovalBadge event={selected} />
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
          <>
            <Button onClick={() => navigate(`/events/view/${selected._id}/checkout`)}>
              <ShoppingCart className="mr-2 h-4 w-4" />
              {t('organizer.checkout')}
            </Button>
            <Button variant="outline" onClick={() => navigate(`/events/view/${selected._id}`)}>
              {t('myEvents.open', { ns: 'organizer' })}
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate(`/events/view/${selected._id}/sellers`)}
            >
              <Users className="mr-2 h-4 w-4" />
              {t('menu.participants', { ns: 'common' })}
            </Button>
          </>
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
          <EventList events={shownUpcoming} isHelper={isHelper} onChoose={choose} />
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
          {showPast && <EventList events={past} isHelper={isHelper} onChoose={choose} />}
        </section>
      )}
    </>
  );
}

/** Upcoming events shown before "show all" */
const VISIBLE_UPCOMING = 3;

function EventList({
  events,
  isHelper,
  onChoose,
}: {
  events: Doc<'events'>[];
  isHelper: (event: Doc<'events'>) => boolean;
  onChoose: (event: Doc<'events'>) => void;
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
                  <ApprovalBadge event={event} />
                  {isHelper(event) && (
                    <Badge variant="outline">{t('myEvents.helper', { ns: 'organizer' })}</Badge>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => onChoose(event)}
              >
                {t('organizer.select')}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Public events are checked by the platform; the others need no approval. */
function ApprovalBadge({ event }: { event: Doc<'events'> }) {
  const { t } = useTranslation('dashboard');
  if (event.visibility !== 'public') return null;
  if (event.approvalStatus === 'rejected') {
    return <Badge variant="destructive">{t('myEvents.rejected', { ns: 'organizer' })}</Badge>;
  }
  if (event.approvalStatus === 'pending' || event.isApproved === false) {
    return <Badge variant="outline">{t('myEvents.pending', { ns: 'organizer' })}</Badge>;
  }
  return <Badge variant="secondary">{t('organizer.approved')}</Badge>;
}

function ApprovalNote({ event }: { event: Doc<'events'> }) {
  const { t } = useTranslation('dashboard');
  if (event.visibility !== 'public') return null;
  if (event.approvalStatus === 'rejected' && event.rejectionReason) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
        <div className="text-xs font-medium uppercase tracking-wide text-destructive">
          {t('myEvents.rejected', { ns: 'organizer' })}
        </div>
        <div className="mt-1 text-sm whitespace-pre-line">{event.rejectionReason}</div>
      </div>
    );
  }
  if (event.approvalStatus === 'pending' || event.isApproved === false) {
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
  const running = event.startDate <= Date.now();
  return (
    <Card className="border-primary/40 overflow-hidden" data-testid={testId}>
      {event.coverImage && event.coverImage !== failedImage && (
        <StorageImage
          storageId={event.coverImage}
          alt=""
          className="w-full h-40 sm:h-56 object-cover"
          onError={() => setFailedImage(event.coverImage ?? null)}
        />
      )}
      <CardContent className="py-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="uppercase tracking-wide">{label}</span>
          {running && <Badge>{t('nextBazaar.running')}</Badge>}
        </div>
        {/* Full title: long names of bazaars wrap instead of being cut off */}
        <h2 className="text-2xl font-semibold break-words">{event.title}</h2>
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <Calendar className="h-4 w-4 shrink-0" />
            {formatDateRangeDE(event.startDate, event.endDate)}
          </span>
          {event.location && (
            <span className="flex items-center gap-2 min-w-0">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="break-words">{event.location}</span>
            </span>
          )}
        </div>
        {badges && <div className="flex flex-wrap gap-2">{badges}</div>}
        {note}
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">{actions}</div>
        {footer && <p className="text-sm">{footer}</p>}
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </section>
  );
}

function Tile({
  to,
  icon: Icon,
  title,
  text,
  badge = 0,
}: {
  to: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  text?: string;
  badge?: number;
}) {
  return (
    <Link
      to={to}
      className="group rounded-xl border bg-card p-4 flex gap-3 items-start transition-colors hover:border-primary/50 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="rounded-lg bg-primary/10 text-primary p-2 shrink-0">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="font-medium">{title}</span>
          {badge > 0 && (
            <span className="rounded-full bg-primary text-primary-foreground text-xs px-2 py-0.5">
              {badge}
            </span>
          )}
        </span>
        {text && <span className="block text-sm text-muted-foreground mt-0.5">{text}</span>}
      </span>
    </Link>
  );
}
