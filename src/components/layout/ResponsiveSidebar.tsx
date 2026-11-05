import { Sheet, SheetContent } from '../ui/sheet';
import { Sidebar as AppSidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { useSidebar } from '../../context/SidebarContext';
import { useOnboarding } from '../../context/OnboardingContext';
import { useQuery } from '../../lib/api/react';
import { api } from '../../lib/api/functions';
import { useUserRole } from '../../context/UserRoleContext';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useCurrentEventId } from '../../hooks/useCurrentEvent';
import { setPhoneShell } from '../../lib/pageScroll';
import { selectEvent } from '../../lib/selectedEvent';
import { cn } from '../../lib/utils';

interface ResponsiveSidebarProps {
  children: React.ReactNode;
}

const FULL_BLEED_PAGES = new Set(['/features', '/pricing', '/about']);
const FOCUS_PAGES = new Set(['/events/new']);
const MARKETING_PAGES = [
  '/features',
  '/pricing',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  '/imprint',
];

export function ResponsiveSidebar({ children }: ResponsiveSidebarProps) {
  const user = useQuery(api.users.viewer);
  const { role } = useUserRole();
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : false
  );

  const { mobileSidebarOpen, fixedSidebarOpen, setMobileSidebarOpen, setFixedSidebarOpen } =
    useSidebar();
  const { isActive, currentStep } = useOnboarding();
  const isOnboardingStepActive = isActive && !!currentStep;
  const isOnboardingSidebarStep = isActive && currentStep?.targetId?.startsWith('sidebar-');
  const shouldShowMobileSidebar = !isActive || currentStep?.showMobileSidebar !== false;

  const currentPage = useLocation().pathname;
  const { eventId, pageEventId } = useCurrentEventId();
  // Opening an event's page chooses it; organizers otherwise see their chosen or most
  // current event in the menu (src/lib/selectedEvent.ts)
  useEffect(() => {
    if (pageEventId) selectEvent(pageEventId);
  }, [pageEventId]);
  const eventTitle = useQuery(api.events.getEvent, eventId ? { id: eventId } : 'skip')?.title;

  // `/` is the landing page for visitors and the overview for signed-in users
  const isLandingPage = currentPage === '/' && !user;
  // Marketing and legal pages are full width, but the menu can still be opened from the header
  const isMarketingPage =
    isLandingPage || MARKETING_PAGES.some((path) => currentPage.startsWith(path));
  // Creating a bazaar is one task from start to end: nothing else on the screen
  const isFocusPage = FOCUS_PAGES.has(currentPage.replace(/\/+$/, ''));
  const showFixedSidebar = !isMarketingPage && !isFocusPage;
  const canOpenMobileSidebar = isDesktop ? true : shouldShowMobileSidebar;

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setFixedSidebarOpen(showFixedSidebar);
  }, [setFixedSidebarOpen, showFixedSidebar]);

  useEffect(() => {
    // Desktop sidebar must stay stable during onboarding.
    if (isDesktop) {
      return;
    }

    if (!isOnboardingStepActive) {
      if ((!canOpenMobileSidebar || !shouldShowMobileSidebar) && mobileSidebarOpen) {
        setMobileSidebarOpen(false);
      }
      return;
    }

    const shouldOpenMobileSidebar = canOpenMobileSidebar && shouldShowMobileSidebar;
    if (mobileSidebarOpen !== shouldOpenMobileSidebar) {
      setMobileSidebarOpen(shouldOpenMobileSidebar);
    }
  }, [
    canOpenMobileSidebar,
    isOnboardingStepActive,
    isDesktop,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    shouldShowMobileSidebar,
  ]);

  // With the tab bar on a phone, only the content scrolls (src/lib/pageScroll.ts)
  const hasTabBar = !!user && fixedSidebarOpen;
  useEffect(() => {
    setPhoneShell(hasTabBar);
    return () => setPhoneShell(false);
  }, [hasTabBar]);

  // Marketing pages bring their own full-width sections and backgrounds
  const isFullBleed = isLandingPage || FULL_BLEED_PAGES.has(currentPage.replace(/\/+$/, '') || '/');
  const mainClassName = cn(
    isFullBleed
      ? 'flex-1 min-w-0'
      : 'flex-1 min-w-0 min-h-[calc(100svh-69px)] p-4 pb-12 md:p-6 md:pb-24 lg:p-8 bg-muted/30',
    // Room for the phone's tab bar, also for sticky buttons (StickyActionBar)
    user &&
      fixedSidebarOpen &&
      'max-lg:pb-24 max-lg:[--bottom-inset:calc(3.5rem+env(safe-area-inset-bottom))]'
  );

  return user ? (
    <div className={isLandingPage ? '' : 'flex'}>
      {fixedSidebarOpen && (
        <aside className="hidden lg:block w-64 border-r h-[calc(100vh-69px)] sticky top-[69px] bg-background">
          <AppSidebar
            currentRole={role}
            currentPage={currentPage}
            eventId={eventId}
            eventTitle={eventTitle}
            isAdmin={user.systemRole === 'admin'}
          />
        </aside>
      )}
      <Sheet
        open={canOpenMobileSidebar ? mobileSidebarOpen : false}
        onOpenChange={(open) => {
          if (!canOpenMobileSidebar) return;
          setMobileSidebarOpen(open);
        }}
      >
        <SheetContent
          side="left"
          className="p-0 w-64"
          onInteractOutside={isOnboardingSidebarStep ? (e) => e.preventDefault() : undefined}
        >
          <AppSidebar
            currentRole={role}
            currentPage={currentPage}
            eventId={eventId}
            eventTitle={eventTitle}
            isMobile={true}
            onClose={() => setMobileSidebarOpen(false)}
            isAdmin={user.systemRole === 'admin'}
          />
        </SheetContent>
      </Sheet>

      {/* Main Content */}

      <main className={mainClassName}>{children}</main>
      {fixedSidebarOpen && (
        <BottomNav
          role={role}
          isAdmin={user.systemRole === 'admin'}
          currentPage={currentPage}
          eventId={eventId}
        />
      )}
    </div>
  ) : (
    <main className={mainClassName}>{children}</main>
  );
}
