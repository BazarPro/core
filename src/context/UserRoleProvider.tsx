import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { UserRoleContext, type UserRole } from './UserRoleContext';
import { splitLocalePrefix } from '../shared/localizedRoutes';

const LAST_PATH_KEY: Record<UserRole, string> = {
  organizer: 'lastPath.organizer',
  participant: 'lastPath.participant',
  administrator: 'lastPath.administrator',
};

/** Pages with an entry in the side menu of a role (src/components/layout/useNavigation.ts) */
const MENU_PAGES: Record<UserRole, RegExp[]> = {
  participant: [/^\/$/, /^\/my-products$/, /^\/my-sales$/, /^\/browse-events$/],
  organizer: [
    /^\/my-events$/,
    /^\/events\/view\/[^/]+(\/(sellers|products|checkout|cash|promo|settings))?$/,
  ],
  administrator: [/^\/$/, /^\/admin\/[a-z-]+$/],
};

function isMenuPage(role: UserRole, path: string) {
  const clean = path.replace(/\/+$/, '') || '/';
  return MENU_PAGES[role].some((pattern) => pattern.test(clean));
}

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

  const getRoleFromPath = (fullPath: string): UserRole | null => {
    const pathname = splitLocalePrefix(fullPath).path;
    if (
      pathname === '/' ||
      pathname.startsWith('/login') ||
      pathname.startsWith('/register') ||
      pathname.startsWith('/password-reset-request') ||
      pathname.startsWith('/features') ||
      pathname.startsWith('/labels') ||
      pathname.startsWith('/bazaars') ||
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
      pathname.startsWith('/products/edit')
    ) {
      return 'participant';
    }

    if (pathname.startsWith('/admin-panel') || pathname.startsWith('/admin')) {
      return 'administrator';
    }

    // The account belongs to every role: the menu stays where the user came from
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

  // The last page of each role that has an entry in the side menu, where switching back
  // to it leads; the overview (`/`) belongs to every role, so it counts for the current one
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const path = splitLocalePrefix(location.pathname).path;
    const pageRole = path === '/' ? role : getRoleFromPath(path);
    if (!pageRole || !isMenuPage(pageRole, path)) return;
    try {
      localStorage.setItem(LAST_PATH_KEY[pageRole], `${path}${location.search}`);
    } catch {
      // Private mode: switching leads to the overview then
    }
  }, [location.pathname, location.search, role]);

  /** Goes on where the new role was left, the first time to its overview. */
  const changeRole = (newRole: UserRole) => {
    setRoleState(newRole);
    localStorage.setItem('userRole', newRole);
    let lastPath: string | null = null;
    try {
      lastPath = localStorage.getItem(LAST_PATH_KEY[newRole]);
    } catch {
      lastPath = null;
    }
    const target = lastPath && isMenuPage(newRole, lastPath.split('?')[0]) ? lastPath : '/';
    if (target !== `${location.pathname}${location.search}`) navigate(target);
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
