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
  ShoppingCart,
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
import { useQuery } from '../../lib/api/react';
import { api } from '../../lib/api/functions';
import { useUserRole } from '../../context/UserRoleContext';
import { SheetHeader, SheetTitle } from '../ui/sheet';
import type { Id } from '../../lib/api/types';
import { saveMenuPath } from '../../lib/menu-history';
import { useInstanceConfig } from '../../hooks/useInstanceConfig';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
  const participantNotices =
    (notices?.products ?? 0) + (notices?.sales ?? 0) + (notices?.messages ?? 0);
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
      label: t('menu.myProducts'),
      page: '/my-products',
      badge: notices?.products ?? 0,
      badgeLabel: 'notifications' as const,
    },
    {
      icon: Receipt,
      label: t('menu.mySales'),
      page: '/my-sales',
      badge: notices?.sales ?? 0,
      badgeLabel: 'sales' as const,
    },
    {
      icon: Search,
      label: isSingle ? t('menu.currentBazaar') : t('menu.events'),
      page: '/browse-events',
      badge: notices?.messages ?? 0,
      badgeLabel: 'organizerMessages' as const,
    },
  ];

  const organizerMenuItems = [
    {
      icon: Calendar,
      label: t('menu.myEvents'),
      page: '/my-events',
      badge: organizerNotices,
      badgeLabel: 'notifications' as const,
    },
  ];

  const adminMenuItems = [
    {
      icon: LayoutDashboard,
      label: t('menu.overview'),
      page: '/admin',
    },
    {
      icon: Flag,
      label: t('menu.reports'),
      page: '/admin/reports',
      badge: adminCounts?.openReports ?? 0,
      badgeLabel: 'reports' as const,
    },
    {
      icon: FileText,
      label: t('menu.content'),
      page: '/admin/content',
    },
    {
      icon: Calendar,
      label: t('menu.events'),
      page: '/admin/events',
      badge: pendingApprovals,
      badgeLabel: 'approvals' as const,
    },
    {
      icon: Users,
      label: t('menu.users'),
      page: '/admin/users',
    },
    {
      icon: Inbox,
      label: t('menu.messages'),
      page: '/admin/messages',
      badge: adminCounts?.unhandledMessages ?? 0,
      badgeLabel: 'messages' as const,
    },
    {
      icon: ScrollText,
      label: t('menu.log'),
      page: '/admin/log',
    },
    {
      icon: Scale,
      label: t('menu.legalPages'),
      page: '/admin/pages',
    },
    {
      icon: Settings,
      label: t('menu.settings'),
      page: '/admin/settings',
    },
  ];

  const eventMenuItems = eventId
    ? [
        {
          icon: LayoutDashboard,
          label: t('menu.dashboard'),
          page: `/events/view/${eventId}`,
          activeId: 'event-dashboard',
        },
        {
          icon: Users,
          label: t('menu.participants'),
          page: `/events/view/${eventId}/sellers`,
          activeId: 'event-sellers',
        },
        {
          icon: Box,
          label: t('menu.products'),
          page: `/events/view/${eventId}/products`,
          activeId: 'event-products',
        },
        {
          icon: ShoppingCart,
          label: t('menu.checkout'),
          page: `/events/view/${eventId}/checkout`,
          activeId: 'event-checkout',
        },
        {
          icon: Banknote,
          label: t('menu.cash'),
          page: `/events/view/${eventId}/cash`,
          activeId: 'event-cash',
        },
        {
          icon: Settings,
          label: t('menu.settings'),
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
          <SheetTitle>{t('menu.title')}</SheetTitle>
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
            {t('menu.dashboard')}
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
                  {t('menu.backToEvents')}
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
                        kind={(item as { badgeLabel?: BadgeKind }).badgeLabel ?? 'notifications'}
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
              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                {t('menu.switchRole')}
              </div>
              {canOrganize && (
                <Button
                  variant={currentRole === 'organizer' ? 'secondary' : 'ghost'}
                  className="w-full justify-start"
                  onClick={() => handleSwitchRole('organizer')}
                >
                  <Building2 className="mr-2 h-4 w-4" />
                  {t('menu.organizer')}
                  {organizerNotices > 0 && currentRole !== 'organizer' && (
                    <PendingBadge count={organizerNotices} kind="notifications" />
                  )}
                </Button>
              )}
              <Button
                variant={currentRole === 'participant' ? 'secondary' : 'ghost'}
                className="w-full justify-start"
                onClick={() => handleSwitchRole('participant')}
              >
                <Store className="mr-2 h-4 w-4" />
                {t('menu.participant')}
                {participantNotices > 0 && currentRole !== 'participant' && (
                  <PendingBadge count={participantNotices} kind="notifications" />
                )}
              </Button>
              {isAdmin && (
                <Button
                  variant={currentRole === 'administrator' ? 'secondary' : 'ghost'}
                  className="w-full justify-start"
                  onClick={() => handleSwitchRole('administrator')}
                >
                  <UserStar className="mr-2 h-4 w-4" />
                  {t('menu.admin')}
                  {pendingApprovals > 0 && currentRole !== 'administrator' && (
                    <PendingBadge count={pendingApprovals} kind="approvals" />
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

type BadgeKind =
  | 'notifications'
  | 'sales'
  | 'reports'
  | 'approvals'
  | 'messages'
  | 'organizerMessages';

/** Small counter at the end of a menu entry, e.g. events waiting for approval. */
function PendingBadge({ count, kind }: { count: number; kind: BadgeKind }) {
  const { t } = useTranslation();
  const label = t(`menu.badge.${kind}`, { count });
  return (
    <span
      className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-semibold text-white"
      aria-label={label}
      title={label}
    >
      {count}
    </span>
  );
}
