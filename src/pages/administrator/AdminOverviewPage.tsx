import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/ui/page-header';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { StatTile } from '../../components/ui/stat-tile';
import { useQuery } from '../../lib/api/react';
import {
  CalendarClock,
  EyeOff,
  Flag,
  Inbox,
  Package,
  Scale,
  TriangleAlert,
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

/** Flags with the value that should not go unnoticed. */
const UNUSUAL = {
  is_login_enabled: false,
  is_registration_enabled: false,
  is_event_creation_enabled: false,
  is_demo_mode: true,
} as const;

export function AdminOverviewPage() {
  const { t } = useTranslation('admin');
  const overview = useQuery(api.moderation.getOverview, {});
  const legalPages = useQuery(api.sitePages.listForAdmin, {});
  // A self-hosted instance must publish its own texts; bazarpro.de falls back to built-in ones
  const incompleteLegalPages = legalPages?.filter(
    (page) => page.hasPlaceholders || (runtimeConfig.mode === 'single' && !page.version)
  ).length;

  const flags = useQuery(api.featureFlags.listForAdmin, {});
  // Switches that lock people out or change what everybody sees: worth a reminder here
  const unusual = (flags ?? []).filter(
    (flag) => UNUSUAL[flag.key as keyof typeof UNUSUAL] === flag.value
  );

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
      // "… are missing" only while some are
      hint: incompleteLegalPages ? t('overview.legalHint') : undefined,
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

      {unusual.length > 0 && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {unusual
                .map((flag) => t(`overview.flags.${flag.key as keyof typeof UNUSUAL}`))
                .join(' · ')}
            </span>
            <Link to="/admin/features" className="font-medium underline underline-offset-4">
              {t('overview.flagsLink')}
            </Link>
          </AlertDescription>
        </Alert>
      )}

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
