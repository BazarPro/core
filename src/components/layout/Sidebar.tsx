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
  UserStar,
  Banknote,
  ShoppingCart,
  Flag,
  FileText,
  Inbox,
  ScrollText,
  Scale,
  Home,
  type LucideIcon,
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
import { useInstanceConfig } from '../../hooks/useInstanceConfig';
import { useTranslation } from 'react-i18next';

interface SidebarProps {
  currentRole: 'organizer' | 'participant' | 'administrator';
  currentPage: string;
  isAdmin?: boolean;
  isMobile?: boolean;
  onClose?: () => void;
  eventId?: Id<'events'>;
  eventTitle?: string;
}

export function Sidebar({
  currentRole,
  currentPage,
  isMobile = false,
  isAdmin = false,
  onClose,
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
  const access = useQuery(api.instance.getMyAccess, {});
  const canOrganize = access?.canOrganize ?? !isSingle;
  const showRoleSwitch = canOrganize || isAdmin;

  // Without access, a remembered organizer role falls back to participant
  useEffect(() => {
    if (access && !access.canOrganize && currentRole === 'organizer') {
      changeRole('participant');
    }
  }, [access, currentRole, changeRole]);
  const adminCounts = useQuery(api.moderation.getMenuCounts, isAdmin ? {} : 'skip');
  const notices = useQuery(api.notifications.getUnreadNoticeCounts, {});
  const participantNotices =
    (notices?.products ?? 0) + (notices?.sales ?? 0) + (notices?.messages ?? 0);
  const organizerNotices = notices?.events ?? 0;

  const handleNavigate = (page: string) => {
    navigate(`${page}`);
    if (isMobile && onClose) {
      onClose();
    }
  };

  const handleSwitchRole = (role: 'organizer' | 'participant' | 'administrator') => {
    changeRole(role);
    if (isMobile && onClose) {
      onClose();
    }
  };

  // The start page for signed-in users (src/pages/dashboard)
  const overviewItem = { icon: Home, label: t('menu.overview'), page: '/' };

  const participantMenuItems: MenuItem[] = [
    overviewItem,
    {
      icon: Package,
      label: t('menu.myProducts'),
      page: '/my-products',
      badge: notices?.products ?? 0,
      badgeLabel: 'notifications',
    },
    {
      icon: Receipt,
      label: t('menu.mySales'),
      page: '/my-sales',
      badge: notices?.sales ?? 0,
      badgeLabel: 'sales',
    },
    {
      icon: Search,
      label: isSingle ? t('menu.currentBazaar') : t('menu.events'),
      page: '/browse-events',
      badge: notices?.messages ?? 0,
      badgeLabel: 'organizerMessages',
    },
  ];

  // Organizers choose their event in the overview; its pages follow below it
  const organizerMenuItems: MenuItem[] = [
    { ...overviewItem, badge: organizerNotices, badgeLabel: 'notifications' },
  ];

  const adminMenuItems: MenuItem[] = [
    // The overview shows the admin overview in this role (src/pages/dashboard)
    overviewItem,
    {
      icon: Flag,
      label: t('menu.reports'),
      page: '/admin/reports',
      badge: adminCounts?.openReports ?? 0,
      badgeLabel: 'reports',
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
      badgeLabel: 'approvals',
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
      badgeLabel: 'messages',
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

  const eventMenuItems: MenuItem[] = eventId
    ? [
        {
          icon: LayoutDashboard,
          label: t('menu.dashboard'),
          page: `/events/view/${eventId}`,
        },
        {
          icon: Users,
          label: t('menu.participants'),
          page: `/events/view/${eventId}/sellers`,
        },
        {
          icon: Box,
          label: t('menu.products'),
          page: `/events/view/${eventId}/products`,
        },
        {
          icon: ShoppingCart,
          label: t('menu.checkout'),
          page: `/events/view/${eventId}/checkout`,
        },
        {
          icon: Banknote,
          label: t('menu.cash'),
          page: `/events/view/${eventId}/cash`,
        },
        {
          icon: Settings,
          label: t('menu.settings'),
          page: `/events/view/${eventId}/settings`,
        },
      ]
    : [];

  const mainMenuItems =
    currentRole === 'organizer'
      ? organizerMenuItems
      : currentRole === 'administrator'
        ? adminMenuItems
        : participantMenuItems;

  const renderMainItem = (item: MenuItem) => {
    const Icon = item.icon;
    const isActive = currentPage === item.page;

    return (
      <Button
        key={item.page}
        variant={isActive ? 'soft' : 'ghost'}
        className="w-full justify-start"
        onClick={() => handleNavigate(item.page)}
        data-onboarding-id={item.page === '/browse-events' ? 'sidebar-events-search' : undefined}
      >
        <Icon className="mr-2 h-4 w-4" />
        {item.label}
        {(item.badge ?? 0) > 0 && (
          <PendingBadge count={item.badge ?? 0} kind={item.badgeLabel ?? 'notifications'} />
        )}
      </Button>
    );
  };

  return (
    <div className="flex flex-col h-full py-4">
      {isMobile && (
        <SheetHeader className="px-4 mb-4">
          <SheetTitle>{t('menu.title')}</SheetTitle>
        </SheetHeader>
      )}
      <nav className="flex-1 px-2">
        <div className="space-y-1" data-onboarding-id="sidebar-participant-nav">
          {mainMenuItems.map(renderMainItem)}
          {eventId && eventTitle && (
            <div
              className="px-4 pt-4 pb-2 text-sm font-semibold line-clamp-2 break-words"
              title={eventTitle}
            >
              {eventTitle}
            </div>
          )}
          {eventId && eventMenuItems.map(renderMainItem)}
        </div>
      </nav>

      {/* User Actions Section */}
      <Separator className="my-4" />
      <div className="px-2 space-y-1">
        {showRoleSwitch && (
          <div data-onboarding-id="sidebar-role-switch">
            <div className="px-2 py-1.5 text-sm text-muted-foreground">{t('menu.switchRole')}</div>
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
    </div>
  );
}

interface MenuItem {
  icon: LucideIcon;
  label: string;
  page: string;
  badge?: number;
  badgeLabel?: BadgeKind;
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
