import { CalendarPlus, Check, ChevronsUpDown, LayoutGrid } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api/functions';
import { useQuery } from '../../lib/api/react';
import type { Doc, Id } from '../../lib/api/types';
import { cn, formatDateDEShort } from '../../lib/utils';
import { eventPhase } from '../../shared/eventPhase';
import { StorageImage } from '../ui/StorageImage';
import { Skeleton } from '../ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

/** Bazaars offered in the menu; the rest is one click away under "Alle Basare" */
const LISTED = 6;

/**
 * The organizer's bazaar in the sidebar, above its pages: picture, name, date and whether
 * it runs. A click lists the other current bazaars to switch to, all bazaars and a new one.
 */
export function BazaarSwitcher({
  eventId,
  badge = 0,
  onNavigate,
}: {
  eventId: Id<'events'>;
  /** News about the bazaars, shown on "Alle Basare" */
  badge?: number;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const events = useQuery(api.events.getMyEvents, open ? { includePast: false } : 'skip');
  const event = useQuery(api.events.getEvent, { id: eventId });
  const access = useQuery(api.instance.getMyAccess, {});

  const go = (path: string) => {
    navigate(path);
    onNavigate?.();
  };

  const listed = (events ?? [])
    .slice()
    .sort((a, b) => a.startDate - b.startDate)
    .slice(0, LISTED);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="bazaar-switcher"
          aria-label={t('menu.switchBazaar')}
          className="group relative flex w-full items-center gap-3 rounded-xl border bg-card p-2 text-left shadow-xs transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-primary"
        >
          {event ? <Cover event={event} /> : <Skeleton className="size-10 shrink-0 rounded-lg" />}
          <span className="min-w-0 flex-1">
            <span
              className="block truncate text-sm font-semibold leading-tight"
              title={event?.title}
            >
              {event?.title ?? <Skeleton className="h-3.5 w-28" />}
            </span>
            {event && <When event={event} />}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
          {badge > 0 && (
            <span
              className="absolute -right-1 -top-1 size-2.5 rounded-full bg-destructive ring-2 ring-background"
              aria-label={t('menu.badge.notifications', { count: badge })}
            />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-64"
      >
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          {t('menu.switchBazaar')}
        </DropdownMenuLabel>
        {events === undefined ? (
          <div className="space-y-2 p-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          listed.map((candidate) => (
            <DropdownMenuItem
              key={candidate._id}
              className="gap-3"
              onSelect={() => go(`/events/view/${candidate._id}`)}
            >
              <Cover event={candidate} small />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{candidate.title}</span>
                <When event={candidate} />
              </span>
              {candidate._id === eventId && <Check className="size-4 shrink-0 text-primary" />}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => go('/my-events')}>
          <LayoutGrid className="size-4" />
          {t('menu.allBazaars')}
          {badge > 0 && (
            <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-semibold text-destructive-foreground">
              {badge}
            </span>
          )}
        </DropdownMenuItem>
        {access?.canCreateEvents && (
          <DropdownMenuItem onSelect={() => go('/events/new')}>
            <CalendarPlus className="size-4" />
            {t('menu.newBazaar')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Cover({ event, small = false }: { event: Doc<'events'>; small?: boolean }) {
  const size = small ? 'size-8 rounded-md' : 'size-10 rounded-lg';
  return event.coverImage ? (
    <StorageImage
      storageId={event.coverImage}
      alt=""
      className={cn(size, 'shrink-0 object-cover')}
    />
  ) : (
    <span
      aria-hidden="true"
      className={cn(
        size,
        'flex shrink-0 items-center justify-center bg-tag font-display text-sm font-extrabold text-tag-foreground'
      )}
    >
      {event.title.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** "25.11. · läuft" — the date, and a green dot while the bazaar runs */
function When({ event }: { event: Doc<'events'> }) {
  const { t } = useTranslation('events');
  const running = eventPhase(event, Date.now()) === 'running';
  return (
    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
      {running && <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />}
      {running ? t('phase.running') : formatDateDEShort(event.startDate)}
    </span>
  );
}
