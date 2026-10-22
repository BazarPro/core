import type { ComponentType, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Calendar,
  CalendarPlus,
  Flag,
  Inbox,
  LayoutDashboard,
  MapPin,
  Package,
  Plus,
  Receipt,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { useQuery } from '../../lib/api/react';
import { api } from '../../lib/api/functions';
import type { Doc, FunctionReturnType } from '../../lib/api/types';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { useInstanceConfig } from '../../hooks/useInstanceConfig';
import { formatDateRangeDE, formatPriceDE } from '../../lib/utils';

/**
 * Start page for signed-in users: what comes next, and the way into each area they
 * work in – selling, organizing, administration (#158). Visitors get the landing page.
 */
export function DashboardPage() {
  const { t } = useTranslation('dashboard');
  const { isSingle } = useInstanceConfig();
  const user = useQuery(api.users.viewer);
  const registered = useQuery(api.events.getMyRegisteredEvents, {});
  const products = useQuery(api.products.getMyProducts);
  const sales = useQuery(api.purchases.getMySales, {});
  const notices = useQuery(api.notifications.getUnreadNoticeCounts, {});
  const access = useQuery(api.instance.getMyAccess, {});
  const isAdmin = useQuery(api.moderation.isViewerAdmin, {}) ?? false;

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  const now = Date.now();
  const upcoming = (registered ?? [])
    .filter((event) => event.endDate >= now)
    .sort((a, b) => a.startDate - b.startDate);
  const available = (products ?? []).filter((product) => !product.sold);
  const name = user.firstName || user.name;

  return (
    <div className="container mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-3xl md:text-4xl mb-2">
          {name ? t('greeting', { name }) : t('greetingAnonymous')}
        </h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      <NextBazaar
        events={upcoming}
        productCount={(event) =>
          available.filter((product) => product.eventIds?.includes(event._id)).length
        }
        sellerInfo={(event) => sales?.find((group) => group.event._id === event._id)}
        isSingle={isSingle}
      />

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

      {access?.canOrganize && (
        <OrganizerSection canCreate={access.canCreateEvents} notices={notices?.events} />
      )}

      {isAdmin && <AdminSection isSingle={isSingle} />}

      {!isSingle && (
        <p className="text-sm text-center">
          <Link to="/features" className="text-muted-foreground hover:text-foreground underline">
            {t('aboutBazarPro')}
          </Link>
        </p>
      )}
    </div>
  );
}

type SalesGroups = FunctionReturnType<typeof api.purchases.getMySales> | undefined;

function salesSummary(sales: SalesGroups, t: TFunction<'dashboard'>): string {
  const sold = (sales ?? []).reduce((sum, group) => sum + group.items.length, 0);
  if (sold === 0) return t('seller.noSales');
  const payout = (sales ?? []).reduce((sum, group) => sum + group.totals.payout, 0);
  return t('seller.sales', { count: sold, payout: formatPriceDE(payout) });
}

function NextBazaar({
  events,
  productCount,
  sellerInfo,
  isSingle,
}: {
  events: Doc<'events'>[];
  productCount: (event: Doc<'events'>) => number;
  sellerInfo: (event: Doc<'events'>) => { sellerNumber?: number; paid: boolean } | undefined;
  isSingle: boolean;
}) {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const [event, ...more] = events;

  if (!event) {
    return (
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
    );
  }

  const count = productCount(event);
  const seller = sellerInfo(event);
  const running = event.startDate <= Date.now();

  return (
    <Card className="border-primary/40">
      <CardContent className="py-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="uppercase tracking-wide">{t('nextBazaar.title')}</span>
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
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            {count > 0 ? t('nextBazaar.products', { count }) : t('nextBazaar.noProducts')}
          </Badge>
          {seller?.sellerNumber !== undefined && (
            <Badge variant="secondary">
              {t('nextBazaar.sellerNumber', { number: seller.sellerNumber })}
            </Badge>
          )}
          {seller?.paid && <Badge variant="secondary">{t('nextBazaar.paid')}</Badge>}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={() => navigate('/my-products', { state: { filterEvent: event._id } })}>
            <Package className="mr-2 h-4 w-4" />
            {t('nextBazaar.manageProducts')}
          </Button>
          <Button variant="outline" onClick={() => navigate(`/public-events/${event._id}`)}>
            {t('nextBazaar.openEvent')}
          </Button>
        </div>
        {more.length > 0 && (
          <p className="text-sm">
            <Link
              to="/browse-events"
              className="text-muted-foreground hover:text-foreground underline"
            >
              {t('nextBazaar.more', { count: more.length })}
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function OrganizerSection({ canCreate, notices }: { canCreate: boolean; notices?: number }) {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const events = useQuery(api.events.getMyEvents, {});
  const now = Date.now();
  const upcoming = (events ?? [])
    .filter((event) => event.endDate >= now)
    .sort((a, b) => a.startDate - b.startDate)
    .slice(0, 3);

  return (
    <Section title={t('organizer.title')}>
      <Card className="sm:col-span-2">
        <CardContent className="py-5 space-y-3">
          <h3 className="font-medium">{t('organizer.upcoming')}</h3>
          {upcoming.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('organizer.none')}</p>
          )}
          <ul className="divide-y">
            {upcoming.map((event) => (
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
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/events/view/${event._id}`)}
                  >
                    {t('organizer.dashboard')}
                  </Button>
                  <Button size="sm" onClick={() => navigate(`/events/view/${event._id}/checkout`)}>
                    {t('organizer.checkout')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      {/* Next to the list, but only as tall as their content */}
      <div className="grid gap-3 sm:col-span-2 content-start">
        <Tile
          to="/my-events"
          icon={Calendar}
          title={t('menu.myEvents', { ns: 'common' })}
          text={t('organizer.allEvents')}
          badge={notices}
        />
        {canCreate && <Tile to="/events/new" icon={CalendarPlus} title={t('organizer.newEvent')} />}
      </div>
    </Section>
  );
}

function AdminSection({ isSingle }: { isSingle: boolean }) {
  const { t } = useTranslation('dashboard');
  const counts = useQuery(api.moderation.getMenuCounts, {});
  // A self-hosted association approves nothing
  const pending = useQuery(api.events.countPendingApprovals, isSingle ? 'skip' : {}) ?? 0;
  const reports = counts?.openReports ?? 0;
  const messages = counts?.unhandledMessages ?? 0;

  return (
    <Section title={t('admin.title')}>
      <Tile to="/admin" icon={LayoutDashboard} title={t('admin.overview')} />
      <Tile
        to="/admin/reports"
        icon={Flag}
        title={t('menu.reports', { ns: 'common' })}
        text={reports > 0 ? t('admin.reports', { count: reports }) : t('admin.allDone')}
        badge={reports}
      />
      {!isSingle && (
        <Tile
          to="/admin/events"
          icon={ShieldCheck}
          title={t('menu.events', { ns: 'common' })}
          text={pending > 0 ? t('admin.approvals', { count: pending }) : t('admin.allDone')}
          badge={pending}
        />
      )}
      <Tile
        to="/admin/messages"
        icon={Inbox}
        title={t('menu.messages', { ns: 'common' })}
        text={messages > 0 ? t('admin.messages', { count: messages }) : t('admin.allDone')}
        badge={messages}
      />
    </Section>
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
