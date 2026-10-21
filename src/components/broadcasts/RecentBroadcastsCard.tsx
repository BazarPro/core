import { useState } from 'react';
import { useQuery } from '../../lib/api/react';
import { AlertTriangle, ChevronRight, Megaphone } from 'lucide-react';
import { api } from '../../lib/api/functions';
import type { Id } from '../../lib/api/types';
import { Button } from '../ui/button';
import { useTranslation } from 'react-i18next';
import { dateLocale } from '../../i18n/format';
import { BroadcastDialog } from './BroadcastDialog';

const SHOWN = 3;

/**
 * The latest messages to the sellers on the event dashboard, with the button to write
 * one (organizer only). The full log is on the participants page.
 */
export function RecentBroadcastsCard({
  eventId,
  canSend,
  onShowAll,
}: {
  eventId: Id<'events'>;
  canSend: boolean;
  onShowAll: () => void;
}) {
  const { t } = useTranslation();
  const broadcasts = useQuery(api.broadcasts.listEventBroadcasts, { eventId });
  const [open, setOpen] = useState(false);
  if (broadcasts === undefined) return null;

  return (
    <section className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Megaphone className="h-5 w-5 text-muted-foreground" /> {t('broadcasts.recentTitle')}
        </h2>
        {canSend && (
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setOpen(true)}>
            <Megaphone className="h-4 w-4" /> {t('broadcasts.write')}
          </Button>
        )}
      </div>
      {broadcasts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('broadcasts.noneSent')}</p>
      ) : (
        <ul className="divide-y">
          {broadcasts.slice(0, SHOWN).map((broadcast) => (
            <li key={broadcast._id} className="py-2">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {broadcast.important && (
                  <AlertTriangle
                    className="h-4 w-4 text-amber-600"
                    aria-label={t('broadcasts.important')}
                  />
                )}
                <span className="truncate">{broadcast.subject}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(broadcast.createdAt).toLocaleString(dateLocale(), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
                {broadcast.audience &&
                  t('broadcasts.recipients', {
                    count: broadcast.recipientCount,
                    audience: t(`broadcasts.audience.${broadcast.audience}`),
                  })}
              </p>
            </li>
          ))}
        </ul>
      )}
      {broadcasts.length > 0 && (
        <button
          onClick={onShowAll}
          className="mt-3 flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {t('broadcasts.showAll')} <ChevronRight className="h-4 w-4" />
        </button>
      )}
      {canSend && <BroadcastDialog eventId={eventId} open={open} onOpenChange={setOpen} />}
    </section>
  );
}
