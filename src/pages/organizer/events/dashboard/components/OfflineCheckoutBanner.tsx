import { CloudOff, RefreshCw, Wifi } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { OfflineNotice } from '../../../../../components/layout/OfflineNotice';
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
      <OfflineNotice
        title={t('checkout.offline.browserTitle')}
        details={t('checkout.offline.browser')}
        reconnect={false}
      />
    );
  }

  if (offline) {
    if (!snapshot) {
      return (
        <OfflineNotice
          tone="destructive"
          icon={CloudOff}
          title={t('checkout.offline.noCopyTitle')}
          details={t('checkout.offline.noCopy')}
        />
      );
    }
    return (
      <OfflineNotice
        title={t('checkout.offline.title')}
        badge={
          pending > 0
            ? { count: pending, label: t('checkout.offline.pending', { count: pending }) }
            : undefined
        }
        details={t('checkout.offline.text', { time: time(snapshot.takenAt) })}
      />
    );
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border bg-card px-4 py-2 text-sm text-muted-foreground"
    >
      <Wifi className="h-4 w-4 shrink-0 text-success-soft-foreground" />
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
