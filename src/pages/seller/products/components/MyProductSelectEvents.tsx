import { useFormContext } from 'react-hook-form';
import { Label } from '../../../../components/ui/label';
import { Checkbox } from '../../../../components/ui/checkbox';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { formatDateRangeDE } from '../../../../lib/utils';
import type { Doc } from '../../../../../convex/_generated/dataModel';

interface MyProductSelectEventsProps {
  selectedEvents?: string[];
  onEventsChange?: (events: string[]) => void;
  hideDisclaimer?: boolean;
  description?: string;
}

export function MyProductSelectEvents({
  selectedEvents: propSelectedEvents,
  onEventsChange,
  hideDisclaimer = false,
  description = 'Wähle die Veranstaltungen, bei denen du dieses Produkt anbieten möchtest',
}: MyProductSelectEventsProps) {
  const formContext = useFormContext(); // Optional context

  const getSelectedEvents = () => {
    if (propSelectedEvents !== undefined) return propSelectedEvents;
    if (formContext) return (formContext.watch('eventIds') as string[]) || [];
    return [];
  };

  const updateEvents = (newEvents: string[]) => {
    if (onEventsChange) {
      onEventsChange(newEvents);
    } else if (formContext) {
      formContext.setValue('eventIds', newEvents);
    }
  };

  const selectedEvents: string[] = getSelectedEvents();
  const allMyEvents = useQuery(api.events.getMyRegisteredEvents, { includePast: true });

  const now = Date.now();
  const events = allMyEvents?.filter((e: Doc<'events'>) => {
    // If it's selected, keep it (so we don't accidentally remove it from past events in edit mode)
    // but only allow selecting NEW events that are in the future
    return e.endDate >= now || selectedEvents.includes(e._id);
  });

  const toggleEvent = (eventId: string) => {
    const event = allMyEvents?.find((e) => e._id === eventId);
    if (event && event.endDate < now && !selectedEvents.includes(eventId)) {
      // Don't allow adding to past events
      return;
    }

    const current = selectedEvents.includes(eventId)
      ? selectedEvents.filter((id) => id !== eventId)
      : [...selectedEvents, eventId];
    updateEvents(current);
  };

  if (!allMyEvents) return <div>Lade Veranstaltungen...</div>;

  return (
    <div className="space-y-3">
      <div className="px-1">
        <Label>Angeboten bei Veranstaltung</Label>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>

      <div className="space-y-2">
        {events?.map((event: Doc<'events'>) => {
          const isPast = event.endDate < now;
          return (
            <label
              key={event._id}
              className={`flex items-start gap-3 rounded-lg border border-border/50 bg-background/60 px-3 py-2 ${isPast ? 'opacity-60 grayscale-[0.5]' : 'hover:bg-muted/40 cursor-pointer'}`}
            >
              <Checkbox
                checked={selectedEvents.includes(event._id)}
                onCheckedChange={() => toggleEvent(event._id)}
                disabled={isPast && !selectedEvents.includes(event._id)}
              />
              <div className="flex-1">
                <div className="text-sm font-medium">
                  {event.title} {isPast && '(Beendet)'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDateRangeDE(event.startDate, event.endDate)} - {event.location}
                </div>
              </div>
            </label>
          );
        })}
      </div>

      {selectedEvents.length === 0 && !hideDisclaimer && (
        <p className="text-xs text-muted-foreground italic px-1">
          Du kannst das Produkt auch später einer Veranstaltung zuordnen
        </p>
      )}
    </div>
  );
}
