import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { UserRoleContext, type UserRole } from './UserRoleContext';

const LAST_PATH_KEY: Record<UserRole, string> = {
  organizer: 'lastPath.organizer',
  participant: 'lastPath.participant',
  administrator: 'lastPath.administrator',
};

export const UserRoleProvider = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [role, setRoleState] = useState<UserRole>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('userRole');
      if (saved === 'organizer' || saved === 'participant' || saved === 'administrator') {
        return saved;
      }
    }
    return 'participant';
  });

  const getRoleFromPath = (pathname: string): UserRole | null => {
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
      return null;
    }

    if (pathname.startsWith('/my-events') || pathname.startsWith('/events/')) {
      return 'organizer';
    }

    if (
      pathname.startsWith('/my-products') ||
      pathname.startsWith('/my-sales') ||
      pathname.startsWith('/browse-events') ||
      pathname.startsWith('/products/new') ||
      pathname.startsWith('/products/edit') ||
      pathname.startsWith('/account')
    ) {
      return 'participant';
    }

    if (pathname.startsWith('/admin-panel') || pathname.startsWith('/admin')) {
      return 'administrator';
    }

    return null;
  };

  // Only on a new page: a role switch navigates in a transition, so the old page is
  // still shown for a moment and must not take the new role back
  const syncedPath = useRef<string | null>(null);
  useEffect(() => {
    if (syncedPath.current === location.pathname) return;
    syncedPath.current = location.pathname;
    const roleFromPath = getRoleFromPath(location.pathname);
    if (roleFromPath && roleFromPath !== role) {
      setRoleOnly(roleFromPath);
    }
  }, [location.pathname, role]);

  // The last page of each role, where switching back to it leads; the overview (`/`)
  // belongs to every role, so it is remembered for the current one
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const pageRole = location.pathname === '/' ? role : getRoleFromPath(location.pathname);
    if (!pageRole) return;
    const currentPath = `${location.pathname}${location.search}`;
    localStorage.setItem(LAST_PATH_KEY[pageRole], currentPath);
  }, [location.pathname, location.search, role]);

  /**
   * On the overview the page stays and shows the new role; elsewhere it goes to the last
   * page of the new role, the first time to its overview.
   */
  const changeRole = (newRole: UserRole) => {
    setRoleState(newRole);
    localStorage.setItem('userRole', newRole);
    if (location.pathname === '/') return;
    const lastPath =
      typeof window !== 'undefined' ? localStorage.getItem(LAST_PATH_KEY[newRole]) : null;
    navigate(lastPath ?? '/');
  };

  const setRoleOnly = (newRole: UserRole) => {
    setRoleState(newRole);
    localStorage.setItem('userRole', newRole);
  };

  return (
    <UserRoleContext.Provider value={{ role, changeRole, setRoleOnly }}>
      {children}
    </UserRoleContext.Provider>
  );
};
