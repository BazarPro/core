import { useState } from 'react';
import { useQuery } from 'convex/react';
import { AlertTriangle, ChevronRight, Megaphone } from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '../ui/button';
import { AUDIENCE_LABELS } from './BroadcastList';
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
  const broadcasts = useQuery(api.broadcasts.listEventBroadcasts, { eventId });
  const [open, setOpen] = useState(false);
  if (broadcasts === undefined) return null;

  return (
    <section className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Megaphone className="h-5 w-5 text-muted-foreground" /> Letzte Nachrichten an Verkäufer
        </h2>
        {canSend && (
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setOpen(true)}>
            <Megaphone className="h-4 w-4" /> Nachricht an Verkäufer
          </Button>
        )}
      </div>
      {broadcasts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine Nachrichten verschickt. Verkäufer bekommen sie per Mail und sehen einen roten
          Marker in ihrem Menü.
        </p>
      ) : (
        <ul className="divide-y">
          {broadcasts.slice(0, SHOWN).map((broadcast) => (
            <li key={broadcast._id} className="py-2">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {broadcast.important && (
                  <AlertTriangle className="h-4 w-4 text-amber-600" aria-label="Wichtig" />
                )}
                <span className="truncate">{broadcast.subject}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(broadcast.createdAt).toLocaleString('de-DE', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
                {broadcast.audience &&
                  ` · an ${broadcast.recipientCount} Verkäufer (${AUDIENCE_LABELS[broadcast.audience]})`}
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
          Alle Nachrichten <ChevronRight className="h-4 w-4" />
        </button>
      )}
      {canSend && <BroadcastDialog eventId={eventId} open={open} onOpenChange={setOpen} />}
    </section>
  );
}
