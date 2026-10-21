import {
  AlertTriangle,
  BookOpen,
  HelpCircle,
  Menu,
  User,
  LogOut,
  Monitor,
  Sun,
  Moon,
} from 'lucide-react';
import { Button } from '../ui/button';
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
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { loginPath } from '../../lib/loginRedirect';
import { useTranslation } from 'react-i18next';
import { LanguageMenuItems } from './LanguageSwitcher';

export function Header() {
  const { t, i18n } = useTranslation();
  const user = useQuery(api.users.viewer);
  const navigate = useNavigate();
  const { isDemoMode } = useFeatureFlags();
  const location = useLocation();
  const { fixedSidebarOpen, setMobileSidebarOpen } = useSidebar();
  const { signOut } = useAuthActions();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const {
    isActive: isOnboardingActive,
    start: startOnboarding,
    stop: stopOnboarding,
  } = useOnboarding();

  const currentPage = location.pathname;

  const fullWidth = !['/', '/login', '/register'].includes(currentPage);
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-m"
                            data-testid="header-user-menu"
                          >
                            {user.image ? (
                              <img
                                src={user.image}
                                alt={t('header.profileImage', { name: user.name ?? '' })}
                                className="h-5 w-5"
                              />
                            ) : (
                              <User className="h-5 w-5" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[260px]">
                          <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
                            {user?.name ?? user?.email ?? user?.phone ?? t('header.anonymous')}
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => navigate('/account')}>
                            <User className="mr-2 h-4 w-4" />
                            {t('header.account')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              isOnboardingActive ? stopOnboarding() : startOnboarding()
                            }
                          >
                            <HelpCircle className="mr-2 h-4 w-4" />
                            {isOnboardingActive ? t('header.stopHelp') : t('header.help')}
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <a
                              href={docsUrl(i18n.resolvedLanguage)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <BookOpen className="mr-2 h-4 w-4" />
                              {t('header.guides')}
                            </a>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
                            {t('theme.title')}
                          </DropdownMenuLabel>
                          <div className="px-2 pb-2">
                            <div className="inline-flex w-full rounded-md border border-border/60 bg-muted/30 p-1">
                              <Button
                                variant={theme === 'system' ? 'secondary' : 'ghost'}
                                size="sm"
                                className="flex-1 h-8"
                                onClick={() => setTheme('system')}
                                aria-pressed={theme === 'system'}
                              >
                                <Monitor className="mr-2 h-4 w-4" />
                                {t('theme.system')}
                              </Button>
                              <Button
                                variant={theme === 'light' ? 'secondary' : 'ghost'}
                                size="sm"
                                className="flex-1 h-8"
                                onClick={() => setTheme('light')}
                                aria-pressed={theme === 'light'}
                              >
                                <Sun className="mr-2 h-4 w-4" />
                                {t('theme.light')}
                              </Button>
                              <Button
                                variant={theme === 'dark' ? 'secondary' : 'ghost'}
                                size="sm"
                                className="flex-1 h-8"
                                onClick={() => setTheme('dark')}
                                aria-pressed={theme === 'dark'}
                              >
                                <Moon className="mr-2 h-4 w-4" />
                                {t('theme.dark')}
                              </Button>
                            </div>
                          </div>
                          <DropdownMenuSeparator />
                          <LanguageMenuItems />
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              signOut();
                              navigate('/');
                            }}
                          >
                            <LogOut className="mr-2 h-4 w-4" />
                            {t('header.logout')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <div className={`${fixedSidebarOpen && 'lg:hidden'}`}>
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
                    <Button variant="ghost" size="icon" aria-label={t('theme.choose')}>
                      {theme === 'system' ? (
                        resolvedTheme === 'dark' ? (
                          <Moon className="h-5 w-5" />
                        ) : (
                          <Sun className="h-5 w-5" />
                        )
                      ) : theme === 'dark' ? (
                        <Moon className="h-5 w-5" />
                      ) : (
                        <Sun className="h-5 w-5" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[200px]">
                    <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
                      {t('theme.title')}
                    </DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={theme}
                      onValueChange={(value) => setTheme(value as 'light' | 'dark' | 'system')}
                    >
                      <DropdownMenuRadioItem value="system">
                        <Monitor className="mr-2 h-4 w-4" />
                        {t('theme.system')}
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="light">
                        <Sun className="mr-2 h-4 w-4" />
                        {t('theme.light')}
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="dark">
                        <Moon className="mr-2 h-4 w-4" />
                        {t('theme.dark')}
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                    <DropdownMenuSeparator />
                    <LanguageMenuItems />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          )}
        </div>
      </header>
      {currentPage === '/'
        ? isDemoMode && (
            <div className="bg-yellow-500 text-yellow-950 px-4 py-2 text-center font-medium flex items-center justify-center gap-2">
              <AlertTriangle className="h-5 w-5 md:h-4 md:w-4 shrink-0" />
              <span className="text-sm md:text-base">{t('header.demoMode')}</span>
            </div>
          )
        : ''}
    </>
  );
}
