import { useEffect } from 'react';
import { useAuthState } from '../../lib/api/react';
import { DashboardPage } from './DashboardPage';
import { PageSkeleton } from '../../components/ui/loading';

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

  if (isAuthenticated) return <DashboardPage />;
  if (isLoading && rememberedSignIn()) {
    return <PageSkeleton className="max-w-5xl" />;
  }
  return <>{landing}</>;
}
