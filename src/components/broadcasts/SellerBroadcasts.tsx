import { useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { BroadcastList } from './BroadcastList';

/**
 * Messages of the organizer on the bazaar page of a seller. Opening the page clears
 * the red marker of this bazaar; the messages that were unread stay marked as new.
 */
export function SellerBroadcasts({ eventId }: { eventId: Id<'events'> }) {
  const unread = useQuery(api.broadcasts.getMyUnreadMessages, {})?.[eventId];
  const markSeen = useMutation(api.notifications.markNoticesSeen);
  // Remembered across the clearing, so the messages stay marked while the page is open
  const [newSince, setNewSince] = useState(Infinity);

  useEffect(() => {
    if (!unread) return;
    setNewSince((since) => Math.min(since, unread.since));
    void markSeen({ area: 'messages', eventId }).catch(() => {});
  }, [unread, eventId, markSeen]);

  return (
    <BroadcastList eventId={eventId} title="Nachrichten vom Veranstalter" newSince={newSince} />
  );
}
