import { useQuery } from 'convex/react';
import { AlertTriangle, Megaphone } from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

export const AUDIENCE_LABELS = {
  all: 'alle',
  accepted: 'mit abgegebenen Artikeln',
  pickup: 'mit abzuholenden Artikeln',
} as const;

/**
 * Messages of the organizer: for sellers on the bazaar page, for the team as a log
 * with recipients. Renders nothing while there are none. Messages from `newSince`
 * on are marked as new.
 */
export function BroadcastList({
  eventId,
  title,
  newSince = Infinity,
}: {
  eventId: Id<'events'>;
  title: string;
  newSince?: number;
}) {
  const broadcasts = useQuery(api.broadcasts.listEventBroadcasts, { eventId });
  if (!broadcasts || broadcasts.length === 0) return null;

  return (
    <section className="rounded-lg border bg-card p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Megaphone className="h-5 w-5 text-muted-foreground" /> {title}
      </h2>
      <ul className="space-y-4">
        {broadcasts.map((broadcast) => (
          <li key={broadcast._id} className="border-l-2 border-primary/40 pl-4">
            <p className="flex flex-wrap items-center gap-2 font-medium">
              {broadcast.createdAt >= newSince && (
                <span className="rounded bg-destructive px-1.5 py-0.5 text-xs font-semibold text-destructive-foreground">
                  Neu
                </span>
              )}
              {broadcast.important && (
                <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  <AlertTriangle className="h-3 w-3" /> Wichtig
                </span>
              )}
              {broadcast.subject}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(broadcast.createdAt).toLocaleString('de-DE', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
              {broadcast.audience &&
                ` · an ${broadcast.recipientCount} Verkäufer (${AUDIENCE_LABELS[broadcast.audience]})`}
            </p>
            <p className="mt-2 whitespace-pre-line break-words text-sm">{broadcast.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
