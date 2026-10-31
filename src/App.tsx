import './styles/App.css';
import { useAuthState, useQuery, useAuthActions } from './lib/api/react';
import { Suspense, useEffect } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
  useParams,
  useNavigate,
  useLocation,
} from 'react-router-dom';
import { LoginPage } from './pages/public/auth/LoginPage';
import { ThemeProvider } from './components/ui/theme-provider';
import { Toaster } from 'sonner';
import { RegisterPage } from './pages/public/auth/RegisterPage';
import { PublicProduct } from './pages/public/products/PublicProduct';
import { ShortProductLink } from './pages/public/products/ShortProductLink';
import { UserRoleProvider } from './context/UserRoleProvider';
import { NavigationHistoryProvider } from './context/NavigationHistoryProvider';
import { LandingPage } from './pages/public/landing/LandingPage';
import { HomePage } from './pages/dashboard/HomePage';
import { CurrentBazaarRedirect, InstanceHomePage } from './pages/public/instance/InstanceHomePage';
import { PublicEventLanding } from './pages/public/events/PublicEventPage';
import { PublicEventProductsPage } from './pages/public/events/PublicEventProductsPage';
import { FeaturesPage } from './pages/public/company/FeaturesPage';
import { PricingPage } from './pages/public/company/PricingPage';
import { AboutPage } from './pages/public/company/AboutPage';
import { ContactPage } from './pages/public/company/ContactPage';
import { LegalPage } from './pages/public/legal/LegalPage';
import { UnsubscribePage } from './pages/public/notifications/UnsubscribePage';
import { useTheme } from './components/ui/theme-context';
import { ResponsiveSidebar } from './components/layout/ResponsiveSidebar';
import { RouteErrorBoundary } from './components/layout/PageErrorBoundary';
import { OfflineBanner } from './components/layout/OfflineBanner';
import { OwnCheckInKeySync } from './components/OwnCheckInKeySync';
import { Header } from './components/layout/Header';
import { SidebarProvider } from './context/SidebarProvider';
import { OnboardingProvider } from './context/OnboardingContext';
import { OnboardingOverlay } from './components/onboarding/OnboardingOverlay';
import { api } from './lib/api/functions';
import { loginPath } from './lib/loginRedirect';
import { runtimeConfig } from './lib/runtimeConfig';
import { useSyncAccountLocale } from './i18n/useLocale';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { WELCOME_PATH } from './native/settings';
import { PageSkeleton } from './components/ui/loading';
import { lazyPage, preloadPages } from './lib/lazyPage';

// Pages behind the sign-in: own chunks, so the public pages load faster
const MyProductsPage = lazyPage(
  () => import('./pages/seller/products/MyProductsPage'),
  'MyProductsPage'
);
const MySalesPage = lazyPage(() => import('./pages/seller/sales/MySalesPage'), 'MySalesPage');
const ProductForm = lazyPage(() => import('./pages/seller/products/ProductForm'), 'ProductForm');
const EventManagementDashboard = lazyPage(
  () => import('./pages/organizer/events/EventManagementDashboard'),
  'EventManagementDashboard'
);
const SettingsPage = lazyPage(
  () => import('./pages/organizer/events/dashboard/SettingsPage'),
  'SettingsPage'
);
const EditEventForm = lazyPage(
  () => import('./pages/organizer/events/EditEventForm'),
  'EditEventForm'
);
const SearchEventsPage = lazyPage(
  () => import('./pages/seller/events/SearchEventsPage'),
  'SearchEventsPage'
);
const AccountPage = lazyPage(() => import('./pages/account/AccountPage'), 'AccountPage');
const AdminPage = lazyPage(() => import('./pages/administrator/AdminPage'), 'AdminPage');
const AdminUsersPage = lazyPage(
  () => import('./pages/administrator/AdminUsersPage'),
  'AdminUsersPage'
);
const AdminEventsPage = lazyPage(
  () => import('./pages/administrator/AdminEventsPage'),
  'AdminEventsPage'
);
const AdminOverviewPage = lazyPage(
  () => import('./pages/administrator/AdminOverviewPage'),
  'AdminOverviewPage'
);
const AdminReportsPage = lazyPage(
  () => import('./pages/administrator/AdminReportsPage'),
  'AdminReportsPage'
);
const AdminContentPage = lazyPage(
  () => import('./pages/administrator/AdminContentPage'),
  'AdminContentPage'
);
const AdminMessagesPage = lazyPage(
  () => import('./pages/administrator/AdminMessagesPage'),
  'AdminMessagesPage'
);
const AdminLogPage = lazyPage(() => import('./pages/administrator/AdminLogPage'), 'AdminLogPage');
const AdminSettingsPage = lazyPage(
  () => import('./pages/administrator/AdminSettingsPage'),
  'AdminSettingsPage'
);
const AdminLegalPagesPage = lazyPage(
  () => import('./pages/administrator/AdminLegalPagesPage'),
  'AdminLegalPagesPage'
);
const SellerManagementPage = lazyPage(
  () => import('./pages/organizer/events/dashboard/SellerManagementPage'),
  'SellerManagementPage'
);
const ProductManagementPage = lazyPage(
  () => import('./pages/organizer/events/dashboard/ProductManagementPage'),
  'ProductManagementPage'
);
const CashReconciliationPage = lazyPage(
  () => import('./pages/organizer/events/dashboard/CashReconciliationPage'),
  'CashReconciliationPage'
);
const CheckoutPage = lazyPage(
  () => import('./pages/organizer/events/dashboard/CheckoutPage'),
  'CheckoutPage'
);

function PublicEventWrapper() {
  const { eventId } = useParams();
  const navigate = useNavigate();

  return (
    <PublicEventLanding
      eventId={eventId || null}
      onNavigate={(page, state) => navigate(page === 'login' ? '/login' : `/${page}`, { state })}
    />
  );
}

function AppToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster richColors position="bottom-right" theme={resolvedTheme} />;
}

function ScrollToTop() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname, location.search]);

  return null;
}

const isSingleInstance = runtimeConfig.mode === 'single';

/**
 * In the mobile app the welcome replaces the landing page. It runs outside the app
 * (src/native/start.tsx), so this reloads to it.
 */
function AppWelcome() {
  useEffect(() => window.location.replace(WELCOME_PATH), []);
  return null;
}

function landingPage() {
  if (Capacitor.isNativePlatform()) return <AppWelcome />;
  return isSingleInstance ? <InstanceHomePage /> : <LandingPage />;
}

/** Signed in: loads the remaining pages while idle, they then also open without connection. */
function PreloadSignedInPages() {
  const { isAuthenticated } = useAuthState();
  useEffect(() => {
    if (!isAuthenticated) return;
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(preloadPages, { timeout: 5000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = setTimeout(preloadPages, 2000);
    return () => clearTimeout(timer);
  }, [isAuthenticated]);
  return null;
}

/** Takes over the language saved at the account after login. */
function AccountLocaleSync() {
  useSyncAccountLocale();
  return null;
}

function App() {
  // Re-renders the whole app when the language changes, also parts without own t()
  useTranslation();
  return (
    <ThemeProvider>
      <AppToaster />
      <AccountLocaleSync />
      <PreloadSignedInPages />
      <OwnCheckInKeySync />
      <Router>
        <ScrollToTop />
        <UserRoleProvider>
          <NavigationHistoryProvider>
            <OnboardingProvider>
              <SidebarProvider>
                <Header />
                <OfflineBanner />
                <ResponsiveSidebar>
                  <RouteErrorBoundary>
                    <Routes>
                      <Route path="/login" element={<LoginPage />} />
                      <Route path="/" element={<HomePage landing={landingPage()} />} />
                      {Capacitor.isNativePlatform() && (
                        <Route path={WELCOME_PATH} element={<AppWelcome />} />
                      )}
                      <Route path="/register" element={<RegisterPage />} />
                      <Route
                        path="/password-reset-request"
                        element={<div>Password Reset Page (Not Implemented)</div>}
                      />
                      {/* Advertising for BazarPro; a self-hosted instance has its own start page */}
                      <Route
                        path="/features"
                        element={isSingleInstance ? <Navigate to="/" replace /> : <FeaturesPage />}
                      />
                      <Route
                        path="/pricing"
                        element={isSingleInstance ? <Navigate to="/" replace /> : <PricingPage />}
                      />
                      <Route
                        path="/about"
                        element={isSingleInstance ? <Navigate to="/" replace /> : <AboutPage />}
                      />
                      <Route path="/contact" element={<ContactPage />} />
                      <Route path="/privacy" element={<LegalPage slug="privacy" />} />
                      <Route path="/terms" element={<LegalPage slug="terms" />} />
                      <Route path="/imprint" element={<LegalPage slug="imprint" />} />
                      <Route path="/benachrichtigungen/abbestellen" element={<UnsubscribePage />} />

                      {/* Öffentliche Route für Produktansicht */}
                      <Route path="/products/view/:productId" element={<PublicProduct />} />
                      <Route path="/p/:productId" element={<ShortProductLink />} />
                      <Route path="/public-events/:eventId" element={<PublicEventWrapper />} />
                      <Route
                        path="/public-events/:eventId/products"
                        element={<PublicEventProductsPage />}
                      />

                      {/* Visitors try the creation wizard before signing up (platform only) */}
                      <Route
                        path="/events/new"
                        element={
                          isSingleInstance ? (
                            <RequireSignIn>
                              <EditEventForm />
                            </RequireSignIn>
                          ) : (
                            <Suspense fallback={<PageSkeleton />}>
                              <EditEventForm />
                            </Suspense>
                          )
                        }
                      />

                      <Route element={<PrivateMainAppContent />}>
                        <Route
                          path="/browse-events"
                          element={
                            isSingleInstance ? <CurrentBazaarRedirect /> : <SearchEventsPage />
                          }
                        />
                        <Route path="/my-products" element={<MyProductsPage />} />
                        <Route path="/my-sales" element={<MySalesPage />} />
                        <Route path="/products/new" element={<ProductForm />} />
                        <Route path="/products/edit/:productId" element={<ProductForm />} />
                        <Route path="/account" element={<AccountPage />} />

                        {/* Old address: the organizer's events are in their overview now */}
                        <Route path="/my-events" element={<Navigate to="/" replace />} />
                        <Route path="/events/edit/:eventId" element={<EditEventForm />} />
                        <Route
                          path="/events/view/:eventId"
                          element={<EventManagementDashboard />}
                        />
                        <Route
                          path="/events/view/:eventId/sellers"
                          element={<SellerManagementPage />}
                        />
                        <Route
                          path="/events/view/:eventId/products"
                          element={<ProductManagementPage />}
                        />
                        <Route path="/events/view/:eventId/checkout" element={<CheckoutPage />} />
                        <Route
                          path="/events/view/:eventId/cash"
                          element={<CashReconciliationPage />}
                        />
                        <Route path="/events/view/:eventId/settings" element={<SettingsPage />} />

                        <Route path="/admin-panel" element={<AdminPage />} />
                        <Route path="/admin/users" element={<AdminUsersPage />} />
                        <Route path="/admin/events" element={<AdminEventsPage />} />
                        <Route path="/admin" element={<AdminOverviewPage />} />
                        <Route path="/admin/reports" element={<AdminReportsPage />} />
                        <Route path="/admin/content" element={<AdminContentPage />} />
                        <Route path="/admin/messages" element={<AdminMessagesPage />} />
                        <Route path="/admin/log" element={<AdminLogPage />} />
                        <Route path="/admin/settings" element={<AdminSettingsPage />} />
                        <Route path="/admin/pages" element={<AdminLegalPagesPage />} />
                      </Route>
                      <Route path="*" element={<Navigate to="/" />} />
                    </Routes>
                  </RouteErrorBoundary>
                </ResponsiveSidebar>
                <OnboardingOverlay />
              </SidebarProvider>
            </OnboardingProvider>
          </NavigationHistoryProvider>
        </UserRoleProvider>
      </Router>
    </ThemeProvider>
  );
}

function PrivateMainAppContent() {
  return (
    <RequireSignIn>
      <Outlet />
    </RequireSignIn>
  );
}

/** Pages behind the sign-in: visitors go to the login and come back afterwards. */
function RequireSignIn({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { isAuthenticated, isLoading } = useAuthState();
  const { signOut } = useAuthActions();
  const user = useQuery(api.users.viewer);
  const isBlocked = user?.status === 'banned' || user?.status === 'deleted';

  useEffect(() => {
    if (isBlocked) {
      void signOut();
    }
  }, [isBlocked, signOut]);

  if (isLoading) {
    return <PageSkeleton />;
  }

  if (!isAuthenticated) {
    return <Navigate to={loginPath(location.pathname + location.search)} />;
  }

  if (isBlocked) {
    return <Navigate to="/login?error=1" replace />;
  }

  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;
}

export default App;
