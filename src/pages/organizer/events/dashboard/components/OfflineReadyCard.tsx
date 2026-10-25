import { CloudDownload, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../../../components/ui/button';
import { dateLocale } from '../../../../../i18n/format';
import { useOfflinePreparation } from '../../../../../lib/offlinePrefetch';

/**
 * In the app: whether the bazaar is on the device for working without internet, and
 * since when. Prepared on its own while the team works online; the button does it now.
 */
export function OfflineReadyCard({ eventId, enabled }: { eventId: string; enabled: boolean }) {
  const { t } = useTranslation('organizer');
  const { available, prepared, preparing, prepare } = useOfflinePreparation(eventId, enabled);
  if (!available) return null;
  return (
    <div
      role="status"
      className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border bg-card px-4 py-3 text-sm"
    >
      <CloudDownload className="h-5 w-5 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        {preparing
          ? t('offlineReady.preparing')
          : prepared
            ? t('offlineReady.ready', {
                count: prepared.products,
                time: new Date(prepared.at).toLocaleTimeString(dateLocale(), {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })
            : t('offlineReady.notYet')}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2"
        onClick={() => void prepare()}
        disabled={preparing}
      >
        <RefreshCw className={preparing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        {t('offlineReady.refresh')}
      </Button>
    </div>
  );
}
