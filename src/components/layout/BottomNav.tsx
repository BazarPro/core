import { Menu, ScanQrCode } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { UserRole } from '../../context/UserRoleContext';
import { useSidebar } from '../../context/SidebarContext';
import { useEventAccess } from '../../hooks/useEventAccess';
import type { Id } from '../../lib/api/types';
import { cn } from '../../lib/utils';
import { TeamScanner } from '../scanner/TeamScanner';
import { isActivePage, useNavigation, type NavItem } from './useNavigation';

const TAB_CLASS =
  'relative flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 pb-1.5 pt-2 text-[11px] font-medium text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';

/**
 * On phones: the main pages one tap away with the thumb, the rest behind "Menü". Whoever runs
 * a bazaar has the scanner in the middle.
 */
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

  const renderTab = (item: NavItem) => {
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
  };
  const middle = Math.ceil(tabs.length / 2);

  return (
    <nav
      aria-label={t('menu.title')}
      className="fixed inset-x-0 bottom-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-bottom))] border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      {tabs.slice(0, middle).map(renderTab)}
      {role === 'organizer' && eventId && <ScanTab eventId={eventId} />}
      {tabs.slice(middle).map(renderTab)}
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

/** Stands out of the bar by --tab-bar-bulge (ResponsiveSidebar). */
function ScanTab({ eventId }: { eventId: Id<'events'> }) {
  const { t } = useTranslation();
  const { canManage } = useEventAccess(eventId);
  const [open, setOpen] = useState(false);
  if (!canManage) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('header.scan')}
        data-testid="tab-scan"
        className={TAB_CLASS}
      >
        <span className="absolute -top-[1.125rem] left-1/2 flex size-12 -translate-x-1/2 items-center justify-center rounded-full border-2 border-primary bg-background text-primary shadow-md">
          <ScanQrCode className="h-6 w-6" />
        </span>
        {/* Where the others have their icon; the label stays on their line */}
        <span className="h-5" />
        {t('menu.scan')}
      </button>
      <TeamScanner eventId={eventId} open={open} onOpenChange={setOpen} />
    </>
  );
}

function Dot() {
  return (
    <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
  );
}
