import type { ComponentType, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  AlertTriangle,
  Calendar,
  CalendarPlus,
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

function OrganizerOverview({ canCreate }: { canCreate: boolean }) {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const events = useQuery(api.events.getMyEvents, {});
  const notices = useQuery(api.notifications.getUnreadNoticeCounts, {});
  const [next, ...more] = upcomingFirst(events);

  return (
    <>
      {next ? (
        <BazaarHero
          event={next}
          label={t('organizer.next')}
          badges={
            next.approvalStatus === 'pending' && (
              <Badge variant="outline">{t('organizer.pending')}</Badge>
            )
          }
          actions={
            <>
              <Button onClick={() => navigate(`/events/view/${next._id}/checkout`)}>
                <ShoppingCart className="mr-2 h-4 w-4" />
                {t('organizer.checkout')}
              </Button>
              <Button variant="outline" onClick={() => navigate(`/events/view/${next._id}`)}>
                {t('organizer.dashboard')}
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate(`/events/view/${next._id}/sellers`)}
              >
                <Users className="mr-2 h-4 w-4" />
                {t('menu.participants', { ns: 'common' })}
              </Button>
            </>
          }
        />
      ) : (
        <Card>
          <CardContent className="py-6 text-muted-foreground">{t('organizer.none')}</CardContent>
        </Card>
      )}

      {more.length > 0 && (
        <Card>
          <CardContent className="py-5 space-y-3">
            <h2 className="font-medium">{t('organizer.later')}</h2>
            <ul className="divide-y">
              {more.slice(0, 4).map((event) => (
                <li
                  key={event._id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium break-words">{event.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDateRangeDE(event.startDate, event.endDate)}
                      {event.approvalStatus === 'pending' && (
                        <Badge variant="outline" className="ml-2">
                          {t('organizer.pending')}
                        </Badge>
                      )}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => navigate(`/events/view/${event._id}`)}
                  >
                    {t('organizer.dashboard')}
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Section title={t('organizer.title')}>
        <Tile
          to="/my-events"
          icon={Calendar}
          title={t('menu.myEvents', { ns: 'common' })}
          text={t('organizer.allEvents')}
          badge={notices?.events}
        />
        {canCreate && (
          <Tile
            to="/events/new"
            icon={CalendarPlus}
            title={t('organizer.newEvent')}
            text={t('organizer.newEventText')}
          />
        )}
      </Section>
    </>
  );
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
  actions,
  footer,
}: {
  event: Doc<'events'>;
  label: string;
  badges?: ReactNode;
  actions: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation('dashboard');
  const running = event.startDate <= Date.now();
  return (
    <Card className="border-primary/40 overflow-hidden">
      {event.coverImage && (
        <StorageImage
          storageId={event.coverImage}
          alt=""
          className="w-full h-40 sm:h-56 object-cover"
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
