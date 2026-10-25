import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { isOfflineAvailable, useDisconnected } from '../../lib/offlineMode';

/**
 * Says that the app shows the last loaded state while the connection is gone. The cash
 * desk shows its own, more detailed note.
 */
export function OfflineBanner() {
  const { t } = useTranslation();
  const disconnected = useDisconnected();
  const { pathname } = useLocation();
  if (!disconnected || !isOfflineAvailable() || pathname.endsWith('/checkout')) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-200"
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>{t('offlineBanner')}</span>
    </div>
  );
}
