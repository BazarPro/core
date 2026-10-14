import './styles/App.css';
import { useConvexAuth, useQuery } from 'convex/react';
import { useEffect } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
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
import { MyProductsPage } from './pages/seller/products/MyProductsPage';
import { MySalesPage } from './pages/seller/sales/MySalesPage';
import { ProductForm } from './pages/seller/products/ProductForm';
import { PublicProduct } from './pages/public/products/PublicProduct';
import { MyEventsPage } from './pages/organizer/events/MyEventsPage';
import { EventManagementDashboard } from './pages/organizer/events/EventManagementDashboard';
import { SettingsPage } from './pages/organizer/events/dashboard/SettingsPage';
import { UserRoleProvider } from './context/UserRoleProvider';
import { NavigationHistoryProvider } from './context/NavigationHistoryProvider';
import { LandingPage } from './pages/public/landing/LandingPage';
import { InstanceHomePage } from './pages/public/instance/InstanceHomePage';
import { EditEventForm } from './pages/organizer/events/EditEventForm';
import { PublicEventLanding } from './pages/public/events/PublicEventPage';
import { PublicEventProductsPage } from './pages/public/events/PublicEventProductsPage';
import { SearchEventsPage } from './pages/seller/events/SearchEventsPage';
import { FeaturesPage } from './pages/public/company/FeaturesPage';
import { PricingPage } from './pages/public/company/PricingPage';
import { AboutPage } from './pages/public/company/AboutPage';
import { ContactPage } from './pages/public/company/ContactPage';
import { LegalPage } from './pages/public/legal/LegalPage';
import { AccountPage } from './pages/account/AccountPage';
import { useTheme } from './components/ui/theme-context';
import { ResponsiveSidebar } from './components/layout/ResponsiveSidebar';
import { Header } from './components/layout/Header';
import { SidebarProvider } from './context/SidebarProvider';
import { OnboardingProvider } from './context/OnboardingContext';
import { OnboardingOverlay } from './components/onboarding/OnboardingOverlay';
import { AdminPage } from './pages/administrator/AdminPage';
import { AdminUsersPage } from './pages/administrator/AdminUsersPage';
import { AdminEventsPage } from './pages/administrator/AdminEventsPage';
import { AdminOverviewPage } from './pages/administrator/AdminOverviewPage';
import { AdminReportsPage } from './pages/administrator/AdminReportsPage';
import { AdminContentPage } from './pages/administrator/AdminContentPage';
import { AdminMessagesPage } from './pages/administrator/AdminMessagesPage';
import { AdminLogPage } from './pages/administrator/AdminLogPage';
import { AdminSettingsPage } from './pages/administrator/AdminSettingsPage';
import { AdminLegalPagesPage } from './pages/administrator/AdminLegalPagesPage';
import { SellerManagementPage } from './pages/organizer/events/dashboard/SellerManagementPage';
import { ProductManagementPage } from './pages/organizer/events/dashboard/ProductManagementPage';
import { CashReconciliationPage } from './pages/organizer/events/dashboard/CashReconciliationPage';
import { api } from '../convex/_generated/api';
import { loginPath } from './lib/loginRedirect';
import { runtimeConfig } from './lib/runtimeConfig';

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

function App() {
  return (
    <ThemeProvider>
      <AppToaster />
      <Router>
        <ScrollToTop />
        <UserRoleProvider>
          <NavigationHistoryProvider>
            <OnboardingProvider>
              <SidebarProvider>
                <Header />
                <ResponsiveSidebar>
                  <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route
                      path="/"
                      element={isSingleInstance ? <InstanceHomePage /> : <LandingPage />}
                    />
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

                    {/* Öffentliche Route für Produktansicht */}
                    <Route path="/products/view/:productId" element={<PublicProduct />} />
                    <Route path="/public-events/:eventId" element={<PublicEventWrapper />} />
                    <Route
                      path="/public-events/:eventId/products"
                      element={<PublicEventProductsPage />}
                    />

                    <Route element={<PrivateMainAppContent />}>
                      <Route path="/browse-events" element={<SearchEventsPage />} />
                      <Route path="/my-products" element={<MyProductsPage />} />
                      <Route path="/my-sales" element={<MySalesPage />} />
                      <Route path="/products/new" element={<ProductForm />} />
                      <Route path="/products/edit/:productId" element={<ProductForm />} />
                      <Route path="/account" element={<AccountPage />} />

                      <Route path="/my-events" element={<MyEventsPage />} />
                      <Route path="/events/new" element={<EditEventForm />} />
                      <Route path="/events/edit/:eventId" element={<EditEventForm />} />
                      <Route path="/events/view/:eventId" element={<EventManagementDashboard />} />
                      <Route
                        path="/events/view/:eventId/sellers"
                        element={<SellerManagementPage />}
                      />
                      <Route
                        path="/events/view/:eventId/products"
                        element={<ProductManagementPage />}
                      />
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
  const location = useLocation();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const user = useQuery(api.users.viewer);
  const isBlocked = user?.status === 'banned' || user?.status === 'deleted';

  useEffect(() => {
    if (isBlocked) {
      void signOut();
    }
  }, [isBlocked, signOut]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={loginPath(location.pathname + location.search)} />;
  }

  if (isBlocked) {
    return <Navigate to="/login?error=1" replace />;
  }

  return <Outlet />;
}

export default App;
