import { useEffect } from 'react';
import { useMutation, useQuery } from '../lib/api/react';
import { api } from '../lib/api/functions';
import type { NoticeArea } from '../../convex/constants';

/**
 * Clears the red menu marker of `area` while its page is open, also for
 * notifications that arrive while the user is looking at it.
 */
export function useMarkNoticesSeen(area: NoticeArea) {
  const counts = useQuery(api.notifications.getUnreadNoticeCounts, {});
  const markSeen = useMutation(api.notifications.markNoticesSeen);
  const unread = counts?.[area] ?? 0;

  useEffect(() => {
    if (unread > 0) void markSeen({ area }).catch(() => {});
  }, [unread, area, markSeen]);
}
