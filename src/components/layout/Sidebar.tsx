import {
  Package,
  Calendar,
  Search,
  Store,
  Building2,
  LayoutDashboard,
  Users,
  Box,
  Settings,
  ArrowLeft,
  UserStar,
  Banknote,
  HelpCircle,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
import { useNavigate } from 'react-router-dom';
import { useUserRole } from '../../context/UserRoleContext';
import { useOnboarding } from '../../context/OnboardingContext';
import { SheetHeader, SheetTitle } from '../ui/sheet';
import type { Id } from '../../../convex/_generated/dataModel';
import { saveMenuPath } from '../../lib/menu-history';

interface SidebarProps {
  currentRole: 'organizer' | 'participant' | 'administrator';
  currentPage: string;
  user: { name: string; role: string; imageUrl?: string } | null;
  isAdmin?: boolean;
  isMobile?: boolean;
  onClose?: () => void;
  onLogout?: () => void;
  onSwitchRole?: (role: 'organizer' | 'participant' | 'administrator') => void;
  isHeaderMenu?: boolean;
  eventId?: Id<'events'>;
  eventTitle?: string;
}

export function Sidebar({
  currentRole,
  currentPage,
  isMobile = false,
  user,
  isAdmin = false,
  onClose,
  onSwitchRole,
  isHeaderMenu = false,
  eventId,
  eventTitle,
}: SidebarProps) {
  const navigate = useNavigate();
  const { changeRole } = useUserRole();
  const {
    isActive: isOnboardingActive,
    start: startOnboarding,
    stop: stopOnboarding,
  } = useOnboarding();

  const handleNavigate = (page: string) => {
    const isEventPage = !!eventId && page.startsWith(`/events/view/${eventId}`);
    saveMenuPath(currentRole, page, isEventPage ? eventId : undefined);
    navigate(`${page}`);
    if (isMobile && onClose) {
      onClose();
    }
  };

  const handleSwitchRole = (role: 'organizer' | 'participant' | 'administrator') => {
    if (onSwitchRole) {
      onSwitchRole(role);
    } else {
      changeRole(role);
    }
    if (isMobile && onClose) {
      onClose();
    }
  };

  const handleOnboardingHelp = () => {
    if (isOnboardingActive) {
      stopOnboarding();
      return;
    }
    startOnboarding();
  };

  const participantMenuItems = [
    {
      icon: Package,
      label: 'Meine Produkte',
      page: '/my-products',
    },
    {
      icon: Search,
      label: 'Events',
      page: '/browse-events',
    },
  ];

  const organizerMenuItems = [
    {
      icon: Calendar,
      label: 'Meine Events',
      page: '/my-events',
    },
  ];

  const adminMenuItems = [
    {
      icon: Users,
      label: 'Nutzer',
      page: '/admin/users',
    },
    {
      icon: Calendar,
      label: 'Events',
      page: '/admin/events',
    },
  ];

  const eventMenuItems = eventId
    ? [
        {
          icon: LayoutDashboard,
          label: 'Dashboard',
          page: `/events/view/${eventId}`,
          activeId: 'event-dashboard',
        },
        {
          icon: Users,
          label: 'Teilnehmer',
          page: `/events/view/${eventId}/sellers`,
          activeId: 'event-sellers',
        },
        {
          icon: Box,
          label: 'Produkte',
          page: `/events/view/${eventId}/products`,
          activeId: 'event-products',
        },
        {
          icon: Banknote,
          label: 'Kassensturz',
          page: `/events/view/${eventId}/cash`,
          activeId: 'event-cash',
        },
        {
          icon: Settings,
          label: 'Einstellungen',
          page: `/events/view/${eventId}/settings`,
          activeId: 'event-settings',
        },
      ]
    : [];

  const mainMenuItems =
    currentRole === 'organizer'
      ? organizerMenuItems
      : currentRole === 'administrator'
        ? adminMenuItems
        : participantMenuItems;

  return (
    <div className="flex flex-col h-full py-4">
      {isMobile && (
        <SheetHeader className="px-4 mb-4">
          <SheetTitle>Menü</SheetTitle>
        </SheetHeader>
      )}
      <nav className="flex-1 px-2">
        {isHeaderMenu && (
          <Button
            variant="ghost"
            className="w-full justify-start mb-2"
            onClick={() =>
              handleNavigate(currentRole === 'participant' ? 'my-products' : 'my-events')
            }
          >
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Dashboard
          </Button>
        )}

        {!isHeaderMenu && (
          <div className="space-y-1" data-onboarding-id="sidebar-participant-nav">
            {eventId ? (
              <>
                <Button
                  variant="ghost"
                  className="w-full justify-start mb-2 text-muted-foreground hover:text-foreground"
                  onClick={() => handleNavigate('my-events')}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Zurück zu Events
                </Button>

                {eventTitle && (
                  <div className="px-4 py-2 text-sm font-semibold truncate mb-2" title={eventTitle}>
                    {eventTitle}
                  </div>
                )}

                {eventMenuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentPage === item.page;

                  return (
                    <Button
                      key={item.page}
                      variant={isActive ? 'default' : 'ghost'}
                      className="w-full justify-start"
                      onClick={() => handleNavigate(item.page)}
                    >
                      <Icon className="mr-2 h-4 w-4" />
                      {item.label}
                    </Button>
                  );
                })}
              </>
            ) : (
              mainMenuItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPage === item.page;

                return (
                  <Button
                    key={item.page}
                    variant={isActive ? 'default' : 'ghost'}
                    className="w-full justify-start"
                    onClick={() => handleNavigate(item.page)}
                    data-onboarding-id={
                      item.page === '/browse-events' ? 'sidebar-events-search' : undefined
                    }
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    {item.label}
                  </Button>
                );
              })
            )}

            <Button
              variant={isOnboardingActive ? 'secondary' : 'ghost'}
              className="w-full justify-start"
              onClick={handleOnboardingHelp}
              data-onboarding-id="sidebar-help"
            >
              <HelpCircle className="mr-2 h-4 w-4" />
              Hilfe
            </Button>
          </div>
        )}
      </nav>

      {/* User Actions Section */}
      <Separator className="my-4" />
      {user && (
        <div className="px-2 space-y-1">
          {/* Role Switcher on mobile */}
          {!isHeaderMenu && (
            <div data-onboarding-id="sidebar-role-switch">
              <div className="px-2 py-1.5 text-sm text-muted-foreground">Rolle wechseln</div>
              <Button
                variant={currentRole === 'organizer' ? 'secondary' : 'ghost'}
                className="w-full justify-start"
                onClick={() => handleSwitchRole('organizer')}
              >
                <Building2 className="mr-2 h-4 w-4" />
                Veranstalter
              </Button>
              <Button
                variant={currentRole === 'participant' ? 'secondary' : 'ghost'}
                className="w-full justify-start"
                onClick={() => handleSwitchRole('participant')}
              >
                <Store className="mr-2 h-4 w-4" />
                Teilnehmer
              </Button>
              {isAdmin && (
                <Button
                  variant={currentRole === 'administrator' ? 'secondary' : 'ghost'}
                  className="w-full justify-start"
                  onClick={() => handleSwitchRole('administrator')}
                >
                  <UserStar className="mr-2 h-4 w-4" />
                  Admin
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
