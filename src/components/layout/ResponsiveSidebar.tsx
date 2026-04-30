import { Sheet, SheetContent } from '../ui/sheet';
import { Sidebar as AppSidebar } from './Sidebar';
import { useSidebar } from '../../context/SidebarContext';
import { useOnboarding } from '../../context/OnboardingContext';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useUserRole } from '../../context/UserRoleContext';
import type { Id } from '../../../convex/_generated/dataModel';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

interface ResponsiveSidebarProps {
  children: React.ReactNode;
}

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
  const eventId = currentPage.match(/\/events\/view\/([^/]+)/)?.[1] as Id<'events'> | undefined;
  const eventTitle = useQuery(api.events.getEvent, eventId ? { id: eventId } : 'skip')?.title;

  const basePageAllowsSidebar =
    !['/features', '/pricing', '/about', '/contact', '/privacy', '/terms', '/imprint'].some(
      (path) => currentPage.startsWith(path)
    ) && currentPage !== '/';
  const isLandingPage = currentPage === '/';
  const showFixedSidebar = basePageAllowsSidebar;
  const canOpenMobileSidebar =
    (basePageAllowsSidebar || isLandingPage) && (isDesktop ? true : shouldShowMobileSidebar);

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

  return user ? (
    <div className={currentPage === '/' ? '' : 'flex'}>
      {fixedSidebarOpen && (
        <aside className="hidden lg:block w-64 border-r h-[calc(100vh-69px)] sticky top-[69px] bg-background">
          <AppSidebar
            currentRole={role}
            currentPage={currentPage}
            eventId={eventId}
            eventTitle={eventTitle}
            user={{
              name: user?.name || user?.email || user?.phone || 'Anonymous',
              role: role,
              imageUrl: user?.image,
            }}
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
            user={{
              name: user?.name || user?.email || user?.phone || 'Anonymous',
              role: role,
              imageUrl: user?.image,
            }}
            isAdmin={user.systemRole === 'admin'}
          />
        </SheetContent>
      </Sheet>

      {/* Main Content */}

      <main
        className={`flex-1 min-w-0 min-h-[calc(100svh-69px)] ${
          currentPage === '/' ? '' : 'p-4 pb-12 md:p-6 md:pb-24 lg:p-8 bg-muted/30'
        }`}
      >
        {children}
      </main>
    </div>
  ) : (
    <main className={`${currentPage === '/' ? '' : 'p-4 pb-12 md:p-6 md:pb-24 lg:p-8'}`}>
      {children}
    </main>
  );
}
