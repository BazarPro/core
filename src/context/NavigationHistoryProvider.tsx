import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getCurrentPath, pushHistory } from '../lib/navigation-history';
import { useAuthState } from '../lib/api/react';
import { useUserRole } from './UserRoleContext';

/** Pages of no role: they go into the global history only. */
function isPublicPath(pathname: string) {
  return (
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
  );
}

export function NavigationHistoryProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { role } = useUserRole();
  const { isAuthenticated } = useAuthState();

  useEffect(() => {
    // `/` is the overview of the role for signed-in users, so "back" can lead there
    const trackRole =
      location.pathname === '/' ? isAuthenticated : !isPublicPath(location.pathname);
    pushHistory(getCurrentPath(location), trackRole ? role : null);
  }, [location, role, isAuthenticated]);

  return <>{children}</>;
}
