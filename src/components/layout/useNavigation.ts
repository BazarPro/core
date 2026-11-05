import {
  Banknote,
  Box,
  Calendar,
  FileText,
  Flag,
  Home,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  Package,
  Receipt,
  Scale,
  ScrollText,
  Search,
  Settings,
  ShoppingCart,
  Tags,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useUserRole, type UserRole } from '../../context/UserRoleContext';
import { useInstanceConfig } from '../../hooks/useInstanceConfig';
import { api } from '../../lib/api/functions';
import { useQuery } from '../../lib/api/react';
import type { Id } from '../../lib/api/types';

export type BadgeKind =
  | 'notifications'
  | 'sales'
  | 'reports'
  | 'approvals'
  | 'messages'
  | 'organizerMessages';

export interface NavItem {
  icon: LucideIcon;
  label: string;
  /** Shorter name in the phone's tab bar */
  tabLabel?: string;
  page: string;
  badge?: number;
  badgeLabel?: BadgeKind;
  /** Also in the phone's tab bar; the rest stays behind "Menü" */
  tab?: boolean;
  onboardingId?: string;
}

/**
 * Everything one can navigate to, by role: the one list behind the sidebar and the phone's
 * tab bar. `roleBadges` are what waits in the other roles, for the role switch.
 */
export function useNavigation({
  role,
  isAdmin,
  eventId,
}: {
  role: UserRole;
  isAdmin: boolean;
  eventId?: Id<'events'>;
}) {
  const { t } = useTranslation();
  const { changeRole } = useUserRole();
  const { isSingle } = useInstanceConfig();
  // A self-hosted association approves nothing: its admins create the bazaars
  const pendingApprovals =
    useQuery(api.events.countPendingApprovals, isAdmin && !isSingle ? {} : 'skip') ?? 0;
  const access = useQuery(api.instance.getMyAccess, {});
  const canOrganize = access?.canOrganize ?? !isSingle;
  const adminCounts = useQuery(api.moderation.getMenuCounts, isAdmin ? {} : 'skip');
  const notices = useQuery(api.notifications.getUnreadNoticeCounts, {});

  // Without access, a remembered organizer role falls back to participant
  useEffect(() => {
    if (access && !access.canOrganize && role === 'organizer') {
      changeRole('participant');
    }
  }, [access, role, changeRole]);

  const overview: NavItem = { icon: Home, label: t('menu.overview'), page: '/', tab: true };

  const participantItems: NavItem[] = [
    overview,
    {
      icon: Package,
      label: t('menu.myProducts'),
      tabLabel: t('menu.products'),
      page: '/my-products',
      badge: notices?.products ?? 0,
      badgeLabel: 'notifications',
      tab: true,
    },
    {
      icon: Receipt,
      label: t('menu.mySales'),
      tabLabel: t('menu.sales'),
      page: '/my-sales',
      badge: notices?.sales ?? 0,
      badgeLabel: 'sales',
      tab: true,
    },
    {
      icon: Search,
      label: isSingle ? t('menu.currentBazaar') : t('menu.events'),
      tabLabel: t('menu.events'),
      page: '/browse-events',
      badge: notices?.messages ?? 0,
      badgeLabel: 'organizerMessages',
      tab: true,
      onboardingId: 'sidebar-events-search',
    },
  ];

  // Organizers choose their bazaar in the overview; its pages follow below it
  const organizerItems: NavItem[] = [
    {
      icon: LayoutGrid,
      label: t('menu.allBazaars'),
      page: '/',
      badge: notices?.events ?? 0,
      badgeLabel: 'notifications',
      // On a phone the bazaar's own pages take the bar, once there is one
      tab: !eventId,
    },
  ];

  const adminItems: NavItem[] = [
    // The overview shows the admin overview in this role (src/pages/dashboard)
    overview,
    {
      icon: Flag,
      label: t('menu.reports'),
      page: '/admin/reports',
      badge: adminCounts?.openReports ?? 0,
      badgeLabel: 'reports',
      tab: true,
    },
    { icon: FileText, label: t('menu.content'), page: '/admin/content' },
    {
      icon: Calendar,
      label: t('menu.events'),
      page: '/admin/events',
      badge: pendingApprovals,
      badgeLabel: 'approvals',
      tab: true,
    },
    { icon: Users, label: t('menu.users'), page: '/admin/users', tab: true },
    {
      icon: Inbox,
      label: t('menu.messages'),
      page: '/admin/messages',
      badge: adminCounts?.unhandledMessages ?? 0,
      badgeLabel: 'messages',
    },
    { icon: ScrollText, label: t('menu.log'), page: '/admin/log' },
    { icon: Tags, label: t('menu.categories'), page: '/admin/categories' },
    { icon: Scale, label: t('menu.legalPages'), page: '/admin/pages' },
    { icon: Settings, label: t('menu.settings'), page: '/admin/settings' },
  ];

  const eventItems: NavItem[] = eventId
    ? [
        {
          icon: LayoutDashboard,
          label: t('menu.dashboard'),
          page: `/events/view/${eventId}`,
          tab: true,
        },
        {
          icon: Users,
          label: t('menu.participants'),
          page: `/events/view/${eventId}/sellers`,
          tab: true,
        },
        {
          icon: Box,
          label: t('menu.products'),
          page: `/events/view/${eventId}/products`,
          tab: true,
        },
        {
          icon: ShoppingCart,
          label: t('menu.checkout'),
          page: `/events/view/${eventId}/checkout`,
          tab: true,
        },
        { icon: Banknote, label: t('menu.cash'), page: `/events/view/${eventId}/cash` },
        { icon: Settings, label: t('menu.settings'), page: `/events/view/${eventId}/settings` },
      ]
    : [];

  const mainItems =
    role === 'organizer'
      ? organizerItems
      : role === 'administrator'
        ? adminItems
        : participantItems;

  const participantNotices =
    (notices?.products ?? 0) + (notices?.sales ?? 0) + (notices?.messages ?? 0);
  const organizerNotices = notices?.events ?? 0;

  return {
    mainItems,
    eventItems,
    tabs: [...mainItems, ...eventItems].filter((item) => item.tab),
    canOrganize,
    roleBadges: {
      participant: participantNotices,
      organizer: organizerNotices,
      administrator: pendingApprovals,
    } satisfies Record<UserRole, number>,
  };
}

/** Whether a menu entry belongs to the page shown; sub-pages count, e.g. a new item. */
export function isActivePage(item: NavItem, currentPage: string, allPages: NavItem[]): boolean {
  if (item.page === currentPage) return true;
  if (item.page === '/') return false;
  // The most specific entry wins: the bazaar's overview is not active on its sub-pages
  return (
    currentPage.startsWith(`${item.page}/`) &&
    !allPages.some(
      (other) =>
        other !== item &&
        other.page.startsWith(`${item.page}/`) &&
        currentPage.startsWith(other.page)
    )
  );
}
