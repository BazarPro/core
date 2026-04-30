import { type ReactNode, useEffect, useState } from 'react';
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

  useEffect(() => {
    const roleFromPath = getRoleFromPath(location.pathname);
    if (roleFromPath && roleFromPath !== role) {
      setRoleOnly(roleFromPath);
    }
  }, [location.pathname, role]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const roleFromPath = getRoleFromPath(location.pathname);
    if (!roleFromPath) return;
    const currentPath = `${location.pathname}${location.search}`;
    localStorage.setItem(LAST_PATH_KEY[roleFromPath], currentPath);
  }, [location.pathname, location.search]);

  const changeRole = (newRole: UserRole) => {
    setRoleState(newRole);
    localStorage.setItem('userRole', newRole);
    const lastPath =
      typeof window !== 'undefined' ? localStorage.getItem(LAST_PATH_KEY[newRole]) : null;
    if (lastPath) {
      navigate(lastPath);
      return;
    }
    if (newRole === 'organizer') {
      navigate('/my-events');
      return;
    }
    if (newRole === 'participant') {
      navigate('/my-products');
      return;
    }
    navigate('/admin/users');
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
