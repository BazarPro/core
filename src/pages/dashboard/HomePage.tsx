import { Suspense, useEffect } from 'react';
import { useAuthState } from '../../lib/api/react';
import { lazyPage } from '../../lib/lazyPage';
import { PageSkeleton } from '../../components/ui/loading';

// Visitors of `/` get the landing page; the overview loads only for signed-in users
const DashboardPage = lazyPage(() => import('./DashboardPage'), 'DashboardPage');

/** Remembered sign-in, so a returning user sees no flash of the landing page */
const SIGNED_IN_KEY = 'bazarpro.signedIn';

function rememberedSignIn(): boolean {
  try {
    return localStorage.getItem(SIGNED_IN_KEY) === '1';
  } catch {
    return false;
  }
}

/** `/`: the overview for signed-in users, the landing page for visitors. */
export function HomePage({ landing }: { landing: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useAuthState();

  useEffect(() => {
    if (isLoading) return;
    try {
      if (isAuthenticated) localStorage.setItem(SIGNED_IN_KEY, '1');
      else localStorage.removeItem(SIGNED_IN_KEY);
    } catch {
      // Private mode: only the flash on the next visit
    }
  }, [isLoading, isAuthenticated]);

  if (isAuthenticated) {
    return (
      <Suspense fallback={<PageSkeleton className="max-w-5xl" />}>
        <DashboardPage />
      </Suspense>
    );
  }
  if (isLoading && rememberedSignIn()) {
    return <PageSkeleton className="max-w-5xl" />;
  }
  return <>{landing}</>;
}
