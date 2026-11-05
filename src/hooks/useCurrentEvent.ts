import { useLocation } from 'react-router-dom';
import { useUserRole } from '../context/UserRoleContext';
import { api } from '../lib/api/functions';
import { useQuery } from '../lib/api/react';
import type { Id } from '../lib/api/types';
import { selectedOrCurrent, useSelectedEventId } from '../lib/selectedEvent';

/**
 * The bazaar the menu and the scanner work on: the one whose page is open, for organizers
 * otherwise their chosen or most current one (src/lib/selectedEvent.ts).
 */
export function useCurrentEventId() {
  const user = useQuery(api.users.viewer);
  const { role } = useUserRole();
  const pathname = useLocation().pathname;
  const pageEventId = pathname.match(/\/events\/view\/([^/]+)/)?.[1] as Id<'events'> | undefined;
  const selectedId = useSelectedEventId();
  const organizerEvents = useQuery(
    api.events.getMyEvents,
    user && role === 'organizer' && !pageEventId ? { includePast: true } : 'skip'
  );
  const eventId =
    pageEventId ??
    (organizerEvents
      ? (selectedOrCurrent(organizerEvents, selectedId)?._id as Id<'events'> | undefined)
      : undefined);
  return { eventId, pageEventId };
}
