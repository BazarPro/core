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
import { ProductForm } from './pages/seller/products/ProductForm';
import { PublicProduct } from './pages/public/products/PublicProduct';
import { MyEventsPage } from './pages/organizer/events/MyEventsPage';
import { EventManagementDashboard } from './pages/organizer/events/EventManagementDashboard';
import { SettingsPage } from './pages/organizer/events/dashboard/SettingsPage';
import { UserRoleProvider } from './context/UserRoleProvider';
import { NavigationHistoryProvider } from './context/NavigationHistoryProvider';
import { LandingPage } from './pages/public/landing/LandingPage';
import { EditEventForm } from './pages/organizer/events/EditEventForm';
import { PublicEventLanding } from './pages/public/events/PublicEventPage';
import { PublicEventProductsPage } from './pages/public/events/PublicEventProductsPage';
import { SearchEventsPage } from './pages/seller/events/SearchEventsPage';
import { FeaturesPage } from './pages/public/company/FeaturesPage';
import { PricingPage } from './pages/public/company/PricingPage';
import { AboutPage } from './pages/public/company/AboutPage';
import { ContactPage } from './pages/public/company/ContactPage';
import { PrivacyPage } from './pages/public/legal/PrivacyPage';
import { TermsPage } from './pages/public/legal/TermsPage';
import { ImprintPage } from './pages/public/legal/ImprintPage';
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
import { SellerManagementPage } from './pages/organizer/events/dashboard/SellerManagementPage';
import { ProductManagementPage } from './pages/organizer/events/dashboard/ProductManagementPage';
import { CashReconciliationPage } from './pages/organizer/events/dashboard/CashReconciliationPage';
import { api } from '../convex/_generated/api';

function PublicEventWrapper() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <PublicEventLanding
      eventId={eventId || null}
      onNavigate={(page, state) => navigate(page === 'login' ? '/login' : `/${page}`, { state })}
      onViewProducts={(eId) =>
        navigate(`/public-events/${eId}/products`, { state: location.state })
      }
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
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route
                      path="/password-reset-request"
                      element={<div>Password Reset Page (Not Implemented)</div>}
                    />
                    <Route path="/features" element={<FeaturesPage />} />
                    <Route path="/pricing" element={<PricingPage />} />
                    <Route path="/about" element={<AboutPage />} />
                    <Route path="/contact" element={<ContactPage />} />
                    <Route path="/privacy" element={<PrivacyPage />} />
                    <Route path="/terms" element={<TermsPage />} />
                    <Route path="/imprint" element={<ImprintPage />} />

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
    return <Navigate to="/login" />;
  }

  if (isBlocked) {
    return <Navigate to="/login?error=1" replace />;
  }

  return <Outlet />;
}

export default App;
