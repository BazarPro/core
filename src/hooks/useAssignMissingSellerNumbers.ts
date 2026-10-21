import { useEffect, useRef } from 'react';
import { useMutation } from '../lib/api/react';
import { api } from '../lib/api/functions';
import type { Id } from '../../convex/_generated/dataModel';

/**
 * Sellers from before seller numbers existed get theirs the first time the event team
 * opens a seller list. Runs at most once per page visit.
 */
export function useAssignMissingSellerNumbers(
  eventId: Id<'events'> | undefined,
  vendors: { sellerNumber?: number }[] | undefined,
  canManage: boolean
) {
  const assign = useMutation(api.sellerNumbers.assignMissingSellerNumbers);
  const done = useRef(false);
  const missing = !!vendors?.some((vendor) => vendor.sellerNumber === undefined);

  useEffect(() => {
    if (!eventId || !canManage || !missing || done.current) return;
    done.current = true;
    void assign({ eventId }).catch(() => {
      // Not critical: the list works without numbers, the next visit tries again
    });
  }, [eventId, canManage, missing, assign]);
}
