import { Menu } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { UserRole } from '../../context/UserRoleContext';
import { useSidebar } from '../../context/SidebarContext';
import type { Id } from '../../lib/api/types';
import { cn } from '../../lib/utils';
import { isActivePage, useNavigation } from './useNavigation';

const TAB_CLASS =
  'relative flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 pb-1.5 pt-2 text-[11px] font-medium text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';

/** On phones: the main pages one tap away with the thumb, the rest behind "Menü". */
export function BottomNav({
  role,
  isAdmin,
  currentPage,
  eventId,
}: {
  role: UserRole;
  isAdmin: boolean;
  currentPage: string;
  eventId?: Id<'events'>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setMobileSidebarOpen } = useSidebar();
  const { tabs, mainItems, eventItems } = useNavigation({ role, isAdmin, eventId });
  const allItems = [...mainItems, ...eventItems];
  // Whatever waits behind the menu must not stay hidden there
  const waitingInMenu = allItems
    .filter((item) => !item.tab)
    .reduce((sum, item) => sum + (item.badge ?? 0), 0);

  return (
    <nav
      aria-label={t('menu.title')}
      className="fixed inset-x-0 bottom-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-bottom))] border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      {tabs.map((item) => {
        const Icon = item.icon;
        const active = isActivePage(item, currentPage, allItems);
        return (
          <button
            key={item.page}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => navigate(item.page)}
            data-onboarding-id={item.onboardingId ? `tab-${item.onboardingId}` : undefined}
            className={cn(TAB_CLASS, active && 'text-primary dark:text-foreground')}
          >
            <span className="relative">
              <Icon className="h-5 w-5" />
              {(item.badge ?? 0) > 0 && <Dot />}
            </span>
            <span className="max-w-full truncate">{item.tabLabel ?? item.label}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => setMobileSidebarOpen(true)}
        data-onboarding-id="header-mobile-menu"
        aria-label={t('header.openMenu')}
        className={TAB_CLASS}
      >
        <span className="relative">
          <Menu className="h-5 w-5" />
          {waitingInMenu > 0 && <Dot />}
        </span>
        {t('menu.title')}
      </button>
    </nav>
  );
}

function Dot() {
  return (
    <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
  );
}
