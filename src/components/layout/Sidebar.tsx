import {
  Package,
  Receipt,
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
  Flag,
  FileText,
  Inbox,
  ScrollText,
  Scale,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useUserRole } from '../../context/UserRoleContext';
import { SheetHeader, SheetTitle } from '../ui/sheet';
import type { Id } from '../../../convex/_generated/dataModel';
import { saveMenuPath } from '../../lib/menu-history';
import { useInstanceConfig } from '../../hooks/useInstanceConfig';

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
  const { isSingle } = useInstanceConfig();
  // A self-hosted association approves nothing: its admins create the bazaars
  const pendingApprovals =
    useQuery(api.events.countPendingApprovals, isAdmin && !isSingle ? {} : 'skip') ?? 0;
  const access = useQuery(api.instance.getMyAccess, user ? {} : 'skip');
  const canOrganize = access?.canOrganize ?? !isSingle;
  const showRoleSwitch = canOrganize || isAdmin;

  // Without access, a remembered organizer role falls back to participant
  useEffect(() => {
    if (access && !access.canOrganize && currentRole === 'organizer') {
      changeRole('participant');
    }
  }, [access, currentRole, changeRole]);
  const adminCounts = useQuery(api.moderation.getMenuCounts, isAdmin ? {} : 'skip');
  const notices = useQuery(api.notifications.getUnreadNoticeCounts, user ? {} : 'skip');
  const participantNotices = (notices?.products ?? 0) + (notices?.sales ?? 0);
  const organizerNotices = notices?.events ?? 0;

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

  const participantMenuItems = [
    {
      icon: Package,
      label: 'Meine Produkte',
      page: '/my-products',
      badge: notices?.products ?? 0,
      badgeLabel: 'neue Benachrichtigungen',
    },
    {
      icon: Receipt,
      label: 'Meine Verkäufe',
      page: '/my-sales',
      badge: notices?.sales ?? 0,
      badgeLabel: 'neue Verkäufe',
    },
    {
      icon: Search,
      label: isSingle ? 'Aktueller Basar' : 'Events',
      page: '/browse-events',
    },
  ];

  const organizerMenuItems = [
    {
      icon: Calendar,
      label: 'Meine Events',
      page: '/my-events',
      badge: organizerNotices,
      badgeLabel: 'neue Benachrichtigungen',
    },
  ];

  const adminMenuItems = [
    {
      icon: LayoutDashboard,
      label: 'Übersicht',
      page: '/admin',
    },
    {
      icon: Flag,
      label: 'Meldungen',
      page: '/admin/reports',
      badge: adminCounts?.openReports ?? 0,
      badgeLabel: 'offene Meldungen',
    },
    {
      icon: FileText,
      label: 'Inhalte',
      page: '/admin/content',
    },
    {
      icon: Calendar,
      label: 'Events',
      page: '/admin/events',
      badge: pendingApprovals,
      badgeLabel: 'Events warten auf Freigabe',
    },
    {
      icon: Users,
      label: 'Nutzer',
      page: '/admin/users',
    },
    {
      icon: Inbox,
      label: 'Kontaktanfragen',
      page: '/admin/messages',
      badge: adminCounts?.unhandledMessages ?? 0,
      badgeLabel: 'offene Kontaktanfragen',
    },
    {
      icon: ScrollText,
      label: 'Protokoll',
      page: '/admin/log',
    },
    {
      icon: Scale,
      label: 'Rechtstexte',
      page: '/admin/pages',
    },
    {
      icon: Settings,
      label: 'Einstellungen',
      page: '/admin/settings',
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
                    {((item as { badge?: number }).badge ?? 0) > 0 && (
                      <PendingBadge
                        count={(item as { badge?: number }).badge ?? 0}
                        label={(item as { badgeLabel?: string }).badgeLabel ?? ''}
                      />
                    )}
                  </Button>
                );
              })
            )}
          </div>
        )}
      </nav>

      {/* User Actions Section */}
      <Separator className="my-4" />
      {user && (
        <div className="px-2 space-y-1">
          {/* Role Switcher on mobile */}
          {!isHeaderMenu && showRoleSwitch && (
            <div data-onboarding-id="sidebar-role-switch">
              <div className="px-2 py-1.5 text-sm text-muted-foreground">Rolle wechseln</div>
              {canOrganize && (
                <Button
                  variant={currentRole === 'organizer' ? 'secondary' : 'ghost'}
                  className="w-full justify-start"
                  onClick={() => handleSwitchRole('organizer')}
                >
                  <Building2 className="mr-2 h-4 w-4" />
                  Veranstalter
                  {organizerNotices > 0 && currentRole !== 'organizer' && (
                    <PendingBadge count={organizerNotices} label="neue Benachrichtigungen" />
                  )}
                </Button>
              )}
              <Button
                variant={currentRole === 'participant' ? 'secondary' : 'ghost'}
                className="w-full justify-start"
                onClick={() => handleSwitchRole('participant')}
              >
                <Store className="mr-2 h-4 w-4" />
                Teilnehmer
                {participantNotices > 0 && currentRole !== 'participant' && (
                  <PendingBadge count={participantNotices} label="neue Benachrichtigungen" />
                )}
              </Button>
              {isAdmin && (
                <Button
                  variant={currentRole === 'administrator' ? 'secondary' : 'ghost'}
                  className="w-full justify-start"
                  onClick={() => handleSwitchRole('administrator')}
                >
                  <UserStar className="mr-2 h-4 w-4" />
                  Admin
                  {pendingApprovals > 0 && currentRole !== 'administrator' && (
                    <PendingBadge count={pendingApprovals} label="Events warten auf Freigabe" />
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Small counter at the end of a menu entry, e.g. events waiting for approval. */
function PendingBadge({ count, label }: { count: number; label: string }) {
  return (
    <span
      className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-semibold text-white"
      aria-label={`${count} ${label}`}
      title={`${count} ${label}`}
    >
      {count}
    </span>
  );
}
