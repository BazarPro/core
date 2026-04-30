import { useConvexAuth } from 'convex/react';
import { useEffect, useRef } from 'react';
import { useUserRole } from '../context/UserRoleContext';
import { toast } from 'sonner';

const BROWSE_EVENTS_PATH = '/browse-events';

/**
 * Sets the user role to "participant" and redirects to the browse events page after login.
 */
export function useRedirectAfterLogin(): boolean {
  const { isAuthenticated } = useConvexAuth();
  const { setRoleOnly } = useUserRole();
  const hasShownToast = useRef(false);

  useEffect(() => {
    if (isAuthenticated) {
      setRoleOnly('participant');
      if (!hasShownToast.current) {
        toast.success('Erfolgreich angemeldet.');
        hasShownToast.current = true;
      }
    } else {
      hasShownToast.current = false;
    }
  }, [isAuthenticated, setRoleOnly]);

  return !!isAuthenticated;
}

export { BROWSE_EVENTS_PATH };
