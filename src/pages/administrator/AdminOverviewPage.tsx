import { useQuery } from 'convex/react';
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
import { api } from '../../../convex/_generated/api';
import { AdminGuard, AdminPageHeader } from './components/AdminShared';
import { cn } from '../../lib/utils';
import { runtimeConfig } from '../../lib/runtimeConfig';

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
  const navigate = useNavigate();
  const overview = useQuery(api.moderation.getOverview, {});
  const legalPages = useQuery(api.sitePages.listForAdmin, {});
  // A self-hosted instance must publish its own texts; bazarpro.de falls back to built-in ones
  const incompleteLegalPages = legalPages?.filter(
    (page) => page.hasPlaceholders || (runtimeConfig.mode === 'single' && !page.version)
  ).length;

  const todo: Tile[] = [
    {
      icon: Flag,
      label: 'Offene Meldungen',
      value: overview?.openReports,
      hint: 'Gemeldete Inhalte prüfen und entscheiden',
      path: '/admin/reports',
      urgent: (overview?.openReports ?? 0) > 0,
    },
    {
      icon: CalendarClock,
      label: 'Events zur Freigabe',
      value: overview?.pendingEvents,
      hint: 'Öffentliche Basare vor der Veröffentlichung prüfen',
      path: '/admin/events?filter=pending',
      urgent: (overview?.pendingEvents ?? 0) > 0,
    },
    {
      icon: Inbox,
      label: 'Kontaktanfragen',
      value: overview?.unhandledMessages,
      hint: 'Nachrichten aus dem Kontaktformular',
      path: '/admin/messages',
      urgent: (overview?.unhandledMessages ?? 0) > 0,
    },
    {
      icon: Scale,
      label: 'Rechtstexte unvollständig',
      value: incompleteLegalPages,
      hint: 'Impressum, Datenschutz und AGB fehlen oder enthalten Platzhalter',
      path: '/admin/pages',
      urgent: (incompleteLegalPages ?? 0) > 0,
    },
  ];

  const stats: Tile[] = [
    {
      icon: Users,
      label: 'Nutzer',
      value: overview?.users,
      hint: `${overview?.newUsers ?? 0} neu in 7 Tagen · ${overview?.bannedUsers ?? 0} gesperrt`,
      path: '/admin/users',
    },
    {
      icon: CalendarClock,
      label: 'Laufende Events',
      value: overview?.runningEvents,
      hint: `${overview?.upcomingEvents ?? 0} geplant · ${overview?.hiddenEvents ?? 0} gesperrt`,
      path: '/admin/events?filter=running',
    },
    {
      icon: Package,
      label: 'Artikel',
      value: overview?.products,
      hint: 'Alle Artikel durchsuchen',
      path: '/admin/content',
    },
    {
      icon: EyeOff,
      label: 'Ausgeblendete Artikel',
      value: overview?.hiddenProducts,
      hint: 'Von der Moderation eingeschränkt',
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
      <AdminPageHeader
        title="Administration"
        description="Moderiere Inhalte, gib Basare frei und behalte die Plattform im Blick."
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Zu erledigen</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{todo.map(renderTile)}</div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Plattform</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map(renderTile)}</div>
      </section>

      <section className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
        <h2 className="mb-2 font-semibold text-foreground">So funktioniert die Moderation</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Jeder kann Artikel, Fragen und Veranstaltungen melden. Meldungen landen unter
            „Meldungen“, du bekommst eine E-Mail.
          </li>
          <li>
            Eingeschränkte Inhalte werden ausgeblendet, nicht gelöscht. Die betroffene Person sieht
            den Inhalt weiter, erhält die Begründung per E-Mail und kann widersprechen.
          </li>
          <li>
            Als Admin kannst du jedes Event wie ein Veranstalter verwalten: Annahme, Kasse,
            Einstellungen.
          </li>
          <li>Jede Entscheidung steht mit Begründung im Protokoll.</li>
        </ul>
      </section>
    </div>
  );
}
