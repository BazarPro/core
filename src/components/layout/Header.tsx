import { ShoppingBag, AlertTriangle, Menu, User, LogOut, Monitor, Sun, Moon } from 'lucide-react';
import { Button } from '../ui/button';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { useSidebar } from '../../context/SidebarContext';
import { useTheme } from '../ui/theme-context';
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
import { useAuthActions } from '@convex-dev/auth/react';

export function Header() {
  const user = useQuery(api.users.viewer);
  const navigate = useNavigate();
  const { isDemoMode } = useFeatureFlags();
  const location = useLocation();
  const { fixedSidebarOpen, setMobileSidebarOpen } = useSidebar();
  const { signOut } = useAuthActions();
  const { theme, resolvedTheme, setTheme } = useTheme();

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
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
            <ShoppingBag className="h-6 w-6 text-primary" />
            <span className="text-xl">BazarPro</span>
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
                                alt={`${user.name}'s profile`}
                                className="h-5 w-5"
                              />
                            ) : (
                              <User className="h-5 w-5" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[260px]">
                          <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
                            {user?.name ?? user?.email ?? user?.phone ?? 'Anonymous'}
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => navigate('/account')}>
                            <User className="mr-2 h-4 w-4" />
                            Konto
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
                            Darstellung
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
                                System
                              </Button>
                              <Button
                                variant={theme === 'light' ? 'secondary' : 'ghost'}
                                size="sm"
                                className="flex-1 h-8"
                                onClick={() => setTheme('light')}
                                aria-pressed={theme === 'light'}
                              >
                                <Sun className="mr-2 h-4 w-4" />
                                Hell
                              </Button>
                              <Button
                                variant={theme === 'dark' ? 'secondary' : 'ghost'}
                                size="sm"
                                className="flex-1 h-8"
                                onClick={() => setTheme('dark')}
                                aria-pressed={theme === 'dark'}
                              >
                                <Moon className="mr-2 h-4 w-4" />
                                Dunkel
                              </Button>
                            </div>
                          </div>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              signOut();
                              navigate('/');
                            }}
                          >
                            <LogOut className="mr-2 h-4 w-4" />
                            Abmelden
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <div className={`${fixedSidebarOpen && 'lg:hidden'}`}>
                        <Button
                          variant="ghost"
                          className="rounded-m"
                          onClick={() => setMobileSidebarOpen(true)}
                          data-onboarding-id="header-mobile-menu"
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
                    <Button onClick={() => navigate('/login')} data-testid="header-button-login">
                      Anmelden
                    </Button>

                    <Button
                      className="hidden md:block"
                      variant="ghost"
                      onClick={() => navigate('/register')}
                      data-testid="header-button-register"
                    >
                      Registrieren
                    </Button>
                  </>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Theme auswählen">
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
                      Darstellung
                    </DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={theme}
                      onValueChange={(value) => setTheme(value as 'light' | 'dark' | 'system')}
                    >
                      <DropdownMenuRadioItem value="system">
                        <Monitor className="mr-2 h-4 w-4" />
                        System
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="light">
                        <Sun className="mr-2 h-4 w-4" />
                        Hell
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="dark">
                        <Moon className="mr-2 h-4 w-4" />
                        Dunkel
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
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
              <span className="text-sm md:text-base">
                Demo Modus: Dies ist eine Demonstrationsseite. Es finden keine echten
                Veranstaltungen statt.
              </span>
            </div>
          )
        : ''}
    </>
  );
}
