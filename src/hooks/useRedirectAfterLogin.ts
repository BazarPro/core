import { useAuthState } from '../lib/api/react';
import { useEffect, useRef } from 'react';
import { useUserRole } from '../context/UserRoleContext';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

const BROWSE_EVENTS_PATH = '/browse-events';

/**
 * Sets the user role to "participant" and redirects to the browse events page after login.
 */
export function useRedirectAfterLogin(): boolean {
  const { isAuthenticated } = useAuthState();
  const { setRoleOnly } = useUserRole();
  const hasShownToast = useRef(false);
  const { t } = useTranslation('auth');

  useEffect(() => {
    if (isAuthenticated) {
      setRoleOnly('participant');
      if (!hasShownToast.current) {
        toast.success(t('signedIn'));
        hasShownToast.current = true;
      }
    } else {
      hasShownToast.current = false;
    }
  }, [isAuthenticated, setRoleOnly, t]);

  return !!isAuthenticated;
}

export { BROWSE_EVENTS_PATH };
