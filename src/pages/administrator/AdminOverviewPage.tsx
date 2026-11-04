import { PageHeader } from '../../components/ui/page-header';
import { StatTile } from '../../components/ui/stat-tile';
import { useQuery } from '../../lib/api/react';
import {
  CalendarClock,
  EyeOff,
  Flag,
  Inbox,
  Package,
  Scale,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../../lib/api/functions';
import { runtimeConfig } from '../../lib/runtimeConfig';
import { useTranslation } from 'react-i18next';
import { dateLocale } from '../../i18n/format';

interface Tile {
  icon: LucideIcon;
  label: string;
  value: number | undefined;
  hint?: string;
  path: string;
  /** Highlighted when something needs to be done */
  urgent?: boolean;
}

export function AdminOverviewPage() {
  const { t } = useTranslation('admin');
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
            path: '/admin/events?filter=pending',
            urgent: (overview?.pendingEvents ?? 0) > 0,
          },
        ]),
    {
      icon: Inbox,
      label: t('overview.messages'),
      value: overview?.unhandledMessages,
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
      path: '/admin/content?hidden=1',
    },
  ];

  const renderTile = (tile: Tile) => (
    <StatTile
      key={tile.label}
      icon={tile.icon}
      label={tile.label}
      value={tile.value ?? '–'}
      hint={tile.hint}
      to={tile.path}
      urgent={tile.urgent}
    />
  );

  return (
    <div className="space-y-8">
      <PageHeader title={t('overview.title')} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('overview.todo')}</h2>
        <div className="grid gap-4 md:grid-cols-2">{todo.map(renderTile)}</div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('overview.platform')}</h2>
        <div className="grid gap-4 md:grid-cols-2">{stats.map(renderTile)}</div>
      </section>
    </div>
  );
}
