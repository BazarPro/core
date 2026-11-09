import {
  AlertTriangle,
  BookOpen,
  Compass,
  Menu,
  ChevronRight,
  Settings2,
  LogOut,
  Monitor,
  Sun,
  Moon,
  ScanQrCode,
} from 'lucide-react';
import { Button } from '../ui/button';
import { useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useAuthActions } from '../../lib/api/react';
import { api } from '../../lib/api/functions';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { useSidebar } from '../../context/SidebarContext';
import { BrandLogo } from './BrandLogo';
import { useTheme } from '../ui/theme-context';
import { useOnboarding } from '../../context/OnboardingContext';
import { docsUrl } from '../../lib/links';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { loginPath } from '../../lib/loginRedirect';
import { useTranslation } from 'react-i18next';
import { UserAvatar } from '../ui/user-avatar';
import { useLocale } from '../../i18n/useLocale';
import { LOCALES, LOCALE_NAMES } from '../../shared/constants';
import { useUserRole } from '../../context/UserRoleContext';
import { useCurrentEventId } from '../../hooks/useCurrentEvent';
import { useEventAccess } from '../../hooks/useEventAccess';
import { TeamScanner } from '../scanner/TeamScanner';
import type { Id } from '../../lib/api/types';

/** Appearance and language as two compact rows, in the user menu and the visitors' menu. */
function AppearanceAndLanguage() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [locale, setLocale] = useLocale();
  return (
    <>
      <MenuSettingRow label={t('theme.title')}>
        {(
          [
            ['system', Monitor],
            ['light', Sun],
            ['dark', Moon],
          ] as const
        ).map(([value, Icon]) => (
          <SegmentButton
            key={value}
            active={theme === value}
            onClick={() => setTheme(value)}
            label={t(`theme.${value}`)}
          >
            <Icon className="h-3.5 w-3.5" />
          </SegmentButton>
        ))}
      </MenuSettingRow>
      <MenuSettingRow label={t('language.title')}>
        {LOCALES.map((code) => (
          <SegmentButton
            key={code}
            active={locale === code}
            onClick={() => setLocale(code)}
            label={LOCALE_NAMES[code]}
            lang={code}
          >
            {code.toUpperCase()}
          </SegmentButton>
        ))}
      </MenuSettingRow>
    </>
  );
}

/** A setting in the user menu: label on the left, a small segmented choice on the right. */
function MenuSettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-2 py-1.5 text-sm">
      <span>{label}</span>
      <div role="group" aria-label={label} className="inline-flex rounded-md bg-muted p-0.5">
        {children}
      </div>
    </div>
  );
}

function SegmentButton({
  active,
  onClick,
  label,
  lang,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  lang?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      lang={lang}
      className={`inline-flex h-7 min-w-8 items-center justify-center rounded px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

/** Organizing on the desktop: the scanner on every page of the bazaar (phones: BottomNav). */
function ScanButton({ eventId }: { eventId: Id<'events'> }) {
  const { t } = useTranslation();
  const { canManage } = useEventAccess(eventId);
  const [open, setOpen] = useState(false);
  if (!canManage) return null;
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="hidden lg:inline-flex"
        onClick={() => setOpen(true)}
        title={t('header.scan')}
        aria-label={t('header.scan')}
        data-testid="header-scan"
      >
        <ScanQrCode className="h-5 w-5" />
      </Button>
      <TeamScanner eventId={eventId} open={open} onOpenChange={setOpen} />
    </>
  );
}

export function Header() {
  const { t, i18n } = useTranslation();
  const user = useQuery(api.users.viewer);
  const navigate = useNavigate();
  const { isDemoMode } = useFeatureFlags();
  const location = useLocation();
  const { fixedSidebarOpen, setMobileSidebarOpen } = useSidebar();
  const { signOut } = useAuthActions();
  const {
    isActive: isOnboardingActive,
    start: startOnboarding,
    stop: stopOnboarding,
  } = useOnboarding();

  const currentPage = location.pathname;
  const { role } = useUserRole();
  const { eventId } = useCurrentEventId();

  // `/` is the landing page only for visitors; signed-in users get the overview with sidebar
  const isLandingPage = currentPage === '/' && !user;
  const fullWidth = !isLandingPage && !['/login', '/register'].includes(currentPage);
  const hideAuthButtons = currentPage === '/login' || currentPage === '/register';

  return (
    <>
      <header className="border-b bg-background sticky top-0 z-50">
        <div
          className={`px-4 py-4 flex items-center justify-between ${fullWidth ? '' : 'container mx-auto'}`}
        >
          {/* Logo */}
          <div
            className="flex min-w-0 items-center gap-2 cursor-pointer"
            onClick={() => navigate('/')}
          >
            <BrandLogo />
          </div>

          {/* Login/Register */}
          {user ? (
            <>
              <div className="flex items-center gap-4">
                {user && (
                  <>
                    <div className="ml-4 flex gap-2">
                      {role === 'organizer' && eventId && fixedSidebarOpen && (
                        <ScanButton eventId={eventId} />
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full"
                            data-testid="header-user-menu"
                            aria-label={t('header.userMenu')}
                          >
                            <UserAvatar
                              name={user.name}
                              email={user.email}
                              image={user.image}
                              alt={t('header.profileImage', { name: user.name ?? '' })}
                            />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-64 p-1.5">
                          <DropdownMenuItem
                            onClick={() => navigate('/account')}
                            className="gap-3 py-2"
                            title={t('header.account')}
                            data-testid="header-account-link"
                          >
                            <UserAvatar
                              name={user.name}
                              email={user.email}
                              image={user.image}
                              className="size-10 text-base"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {user.name ?? user.email ?? user.phone ?? t('header.anonymous')}
                              </p>
                              {user.name && (user.email ?? user.phone) && (
                                <p className="truncate text-xs text-muted-foreground">
                                  {user.email ?? user.phone}
                                </p>
                              )}
                            </div>
                            <ChevronRight />
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() =>
                              isOnboardingActive ? stopOnboarding() : startOnboarding()
                            }
                          >
                            <Compass />
                            {isOnboardingActive ? t('header.stopTour') : t('header.tour')}
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <a
                              href={docsUrl(i18n.resolvedLanguage)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <BookOpen />
                              {t('header.guides')}
                            </a>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <AppearanceAndLanguage />
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              signOut();
                              navigate('/');
                            }}
                          >
                            <LogOut />
                            {t('header.logout')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {/* With the sidebar or the phone's tab bar the menu is already there */}
                      <div className={fixedSidebarOpen ? 'hidden' : undefined}>
                        <Button
                          variant="ghost"
                          className="rounded-m"
                          onClick={() => setMobileSidebarOpen(true)}
                          data-onboarding-id="header-mobile-menu"
                          aria-label={t('header.openMenu')}
                        >
                          <Menu className="w-5 h-5" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-4">
                {!hideAuthButtons && (
                  <>
                    <Button
                      onClick={() => navigate(loginPath(location.pathname + location.search))}
                      data-testid="header-button-login"
                    >
                      {t('header.login')}
                    </Button>

                    <Button
                      className="hidden md:block"
                      variant="ghost"
                      onClick={() => navigate('/register')}
                      data-testid="header-button-register"
                    >
                      {t('header.register')}
                    </Button>
                  </>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full"
                      aria-label={t('header.settings')}
                      title={t('header.settings')}
                      data-testid="header-settings-menu"
                    >
                      <Settings2 className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64 p-1.5">
                    <AppearanceAndLanguage />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          )}
        </div>
      </header>
      {/* Only above the landing page: next to the sidebar it would push the page down */}
      {isLandingPage && isDemoMode && (
        <div className="bg-yellow-500/15 text-yellow-900 dark:text-yellow-200 px-4 py-2 text-center flex items-center justify-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-sm">{t('header.demoMode')}</span>
        </div>
      )}
    </>
  );
}
