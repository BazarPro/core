import { CloudOff, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../../../components/ui/button';
import { dateLocale } from '../../../../../i18n/format';
import type { CheckoutSnapshot } from '../../../../../lib/offlineCheckout';

type Props = {
  available: boolean;
  disconnected: boolean;
  offline: boolean;
  snapshot: CheckoutSnapshot | null;
  pending: number;
  refreshing: boolean;
  refresh: () => Promise<void>;
};

function time(ms: number) {
  return new Date(ms).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' });
}

/** Whether the cash desk can sell without internet, and what is waiting to be booked. */
export function OfflineCheckoutBanner({
  available,
  disconnected,
  offline,
  snapshot,
  pending,
  refreshing,
  refresh,
}: Props) {
  const { t } = useTranslation('organizer');

  if (!available) {
    if (!disconnected) return null;
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
      >
        <WifiOff className="mt-0.5 h-5 w-5 shrink-0" />
        <p>{t('checkout.offline.browser')}</p>
      </div>
    );
  }

  if (offline) {
    if (!snapshot) {
      return (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-destructive"
        >
          <CloudOff className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{t('checkout.offline.noCopy')}</p>
        </div>
      );
    }
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
      >
        <WifiOff className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="space-y-1">
          <p className="font-semibold">{t('checkout.offline.title')}</p>
          <p className="text-sm">{t('checkout.offline.text', { time: time(snapshot.takenAt) })}</p>
          {pending > 0 && (
            <p className="text-sm font-medium">
              {t('checkout.offline.pending', { count: pending })}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border bg-card px-4 py-2 text-sm text-muted-foreground"
    >
      <Wifi className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
      <span className="min-w-0 flex-1">
        {snapshot
          ? t('checkout.offline.ready', { time: time(snapshot.takenAt) })
          : t('checkout.offline.loading')}
        {pending > 0 && <> · {t('checkout.offline.syncing', { count: pending })}</>}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2"
        onClick={() => void refresh()}
        disabled={refreshing}
      >
        <RefreshCw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        {t('checkout.offline.refresh')}
      </Button>
    </div>
  );
}
