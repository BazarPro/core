import { Building2, Store, UserStar, type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { SheetHeader, SheetTitle } from '../ui/sheet';
import { useUserRole, type UserRole } from '../../context/UserRoleContext';
import type { Id } from '../../lib/api/types';
import { cn } from '../../lib/utils';
import { isActivePage, useNavigation, type BadgeKind, type NavItem } from './useNavigation';

interface SidebarProps {
  currentRole: UserRole;
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
  const { mainItems, eventItems, canOrganize, roleBadges } = useNavigation({
    role: currentRole,
    isAdmin,
    eventId,
  });
  const allItems = [...mainItems, ...eventItems];

  const close = () => {
    if (isMobile) onClose?.();
  };

  const roles: { role: UserRole; icon: LucideIcon; label: string }[] = [
    { role: 'participant', icon: Store, label: t('menu.participant') },
    ...(canOrganize
      ? [{ role: 'organizer' as const, icon: Building2, label: t('menu.organizer') }]
      : []),
    ...(isAdmin
      ? [{ role: 'administrator' as const, icon: UserStar, label: t('menu.admin') }]
      : []),
  ];

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    return (
      <Button
        key={item.page}
        variant={isActivePage(item, currentPage, allItems) ? 'soft' : 'ghost'}
        className="w-full justify-start"
        onClick={() => {
          navigate(item.page);
          close();
        }}
        data-onboarding-id={item.onboardingId}
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
    <div className="flex h-full flex-col gap-4 py-4">
      {isMobile && (
        <SheetHeader className="px-4">
          <SheetTitle>{t('menu.title')}</SheetTitle>
        </SheetHeader>
      )}

      {/* What the menu below is about comes first */}
      {roles.length > 1 && (
        <div className="px-2" data-onboarding-id="sidebar-role-switch">
          <div
            role="group"
            aria-label={t('menu.switchRole')}
            className="flex gap-1 rounded-lg bg-muted p-1"
          >
            {roles.map(({ role, icon: Icon, label }) => {
              const active = currentRole === role;
              return (
                <button
                  key={role}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    changeRole(role);
                    close();
                  }}
                  className={cn(
                    'relative flex min-w-0 flex-auto flex-col items-center gap-0.5 rounded-md px-1.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active && 'bg-card text-foreground shadow-xs'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                  {roleBadgeFor(role, currentRole, roleBadges) > 0 && (
                    <span
                      className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive"
                      aria-label={t('menu.badge.notifications', {
                        count: roleBadgeFor(role, currentRole, roleBadges),
                      })}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <nav className="min-h-0 flex-1 overflow-y-auto px-2">
        <div className="space-y-1" data-onboarding-id="sidebar-participant-nav">
          {mainItems.map(renderItem)}
        </div>
        {eventId && eventItems.length > 0 && (
          <div className="mt-5 space-y-1">
            {eventTitle && (
              <div
                className="line-clamp-2 break-words px-3 pb-1 text-xs font-medium text-muted-foreground"
                title={eventTitle}
              >
                {eventTitle}
              </div>
            )}
            {eventItems.map(renderItem)}
          </div>
        )}
      </nav>
    </div>
  );
}

function roleBadgeFor(role: UserRole, current: UserRole, badges: Record<UserRole, number>) {
  return role === current ? 0 : badges[role];
}

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
