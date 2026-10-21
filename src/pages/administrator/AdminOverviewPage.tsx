import { useQuery } from '../../lib/api/react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarClock,
  ChevronRight,
  EyeOff,
  Flag,
  Inbox,
  Package,
  Scale,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../../lib/api/functions';
import { AdminGuard, AdminPageHeader } from './components/AdminShared';
import { cn } from '../../lib/utils';
import { runtimeConfig } from '../../lib/runtimeConfig';
import { useTranslation } from 'react-i18next';
import { dateLocale } from '../../i18n/format';

interface Tile {
  icon: LucideIcon;
  label: string;
  value: number | undefined;
  hint: string;
  path: string;
  /** Highlighted when something needs to be done */
  urgent?: boolean;
}

export function AdminOverviewPage() {
  return (
    <AdminGuard>
      <Overview />
    </AdminGuard>
  );
}

function Overview() {
  const { t } = useTranslation('admin');
  const navigate = useNavigate();
  const overview = useQuery(api.moderation.getOverview, {});
  const legalPages = useQuery(api.sitePages.listForAdmin, {});
  // A self-hosted instance must publish its own texts; bazarpro.de falls back to built-in ones
  const incompleteLegalPages = legalPages?.filter(
    (page) => page.hasPlaceholders || (runtimeConfig.mode === 'single' && !page.version)
  ).length;

  const isSingle = runtimeConfig.mode === 'single';
  const todo: Tile[] = [
    {
      icon: Flag,
      label: t('overview.openReports'),
      value: overview?.openReports,
      hint: t('overview.openReportsHint'),
      path: '/admin/reports',
      urgent: (overview?.openReports ?? 0) > 0,
    },
    // A self-hosted association approves nothing
    ...(isSingle
      ? []
      : [
          {
            icon: CalendarClock,
            label: t('overview.pending'),
            value: overview?.pendingEvents,
            hint: t('overview.pendingHint'),
            path: '/admin/events?filter=pending',
            urgent: (overview?.pendingEvents ?? 0) > 0,
          },
        ]),
    {
      icon: Inbox,
      label: t('overview.messages'),
      value: overview?.unhandledMessages,
      hint: t('overview.messagesHint'),
      path: '/admin/messages',
      urgent: (overview?.unhandledMessages ?? 0) > 0,
    },
    {
      icon: Scale,
      label: t('overview.legal'),
      value: incompleteLegalPages,
      hint: t('overview.legalHint'),
      path: '/admin/pages',
      urgent: (incompleteLegalPages ?? 0) > 0,
    },
  ];

  const stats: Tile[] = [
    {
      icon: Users,
      label: t('overview.users'),
      value: overview?.users,
      hint: t('overview.usersHint', {
        new: overview?.newUsers ?? 0,
        banned: overview?.bannedUsers ?? 0,
      }),
      path: '/admin/users',
    },
    {
      icon: CalendarClock,
      label: t('overview.running'),
      value: overview?.runningEvents,
      hint: t('overview.runningHint', {
        upcoming: overview?.upcomingEvents ?? 0,
        hidden: overview?.hiddenEvents ?? 0,
      }),
      path: '/admin/events?filter=running',
    },
    {
      icon: Package,
      label: t('overview.products'),
      value: overview?.products,
      hint: overview?.statsUpdatedAt
        ? t('overview.productsCountedAt', {
            time: new Date(overview.statsUpdatedAt).toLocaleTimeString(dateLocale(), {
              hour: '2-digit',
              minute: '2-digit',
            }),
          })
        : t('overview.productsCounted'),
      path: '/admin/content',
    },
    {
      icon: EyeOff,
      label: t('overview.hiddenProducts'),
      value: overview?.hiddenProducts,
      hint: t('overview.hiddenProductsHint'),
      path: '/admin/content?hidden=1',
    },
  ];

  const renderTile = (tile: Tile) => (
    <button
      key={tile.label}
      type="button"
      onClick={() => navigate(tile.path)}
      className={cn(
        'group flex items-start gap-4 rounded-xl border bg-card p-5 text-left shadow-sm transition-shadow hover:shadow-md',
        tile.urgent && 'border-primary/50 bg-primary/5'
      )}
    >
      <span
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted',
          tile.urgent && 'bg-primary text-primary-foreground'
        )}
      >
        <tile.icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-muted-foreground">{tile.label}</span>
        <span className="block text-3xl font-bold">{tile.value ?? '–'}</span>
        <span className="block text-xs text-muted-foreground">{tile.hint}</span>
      </span>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );

  return (
    <div className="space-y-8">
      <AdminPageHeader title={t('overview.title')} description={t('overview.subtitle')} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('overview.todo')}</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{todo.map(renderTile)}</div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('overview.platform')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map(renderTile)}</div>
      </section>

      <section className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
        <h2 className="mb-2 font-semibold text-foreground">{t('overview.howTitle')}</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>{t('overview.how1')}</li>
          <li>{t('overview.how2')}</li>
          <li>{t('overview.how3')}</li>
          <li>{t('overview.how4')}</li>
        </ul>
      </section>
    </div>
  );
}
