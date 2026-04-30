import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getCurrentPath, pushHistory } from '../lib/navigation-history';
import { useUserRole } from './UserRoleContext';

export function NavigationHistoryProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { role } = useUserRole();

  const shouldTrackRolePath = (pathname: string) => {
    if (
      pathname === '/' ||
      pathname.startsWith('/login') ||
      pathname.startsWith('/register') ||
      pathname.startsWith('/password-reset-request') ||
      pathname.startsWith('/features') ||
      pathname.startsWith('/pricing') ||
      pathname.startsWith('/about') ||
      pathname.startsWith('/contact') ||
      pathname.startsWith('/privacy') ||
      pathname.startsWith('/terms') ||
      pathname.startsWith('/imprint') ||
      pathname.startsWith('/public-events') ||
      pathname.startsWith('/products/view')
    ) {
      return false;
    }
    return true;
  };

  useEffect(() => {
    const currentPath = getCurrentPath(location);
    const trackRole = shouldTrackRolePath(location.pathname);
    pushHistory(currentPath, trackRole ? role : null);
  }, [location, role]);

  return <>{children}</>;
}
