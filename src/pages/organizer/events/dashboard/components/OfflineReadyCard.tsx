import { CloudDownload, KeyRound, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../../../../components/ui/alert-dialog';
import { Button } from '../../../../../components/ui/button';
import { dateLocale } from '../../../../../i18n/format';
import { api } from '../../../../../lib/api/functions';
import { useApiClient, useMutation } from '../../../../../lib/api/react';
import type { Id } from '../../../../../lib/api/types';
import { fetchEventKeys } from '../../../../../lib/checkInCode';
import { getUserFacingErrorMessage } from '../../../../../lib/errors';
import { Incomplete, NotStored, useOfflinePreparation } from '../../../../../lib/offlinePrefetch';

/** "14:05", or "12.03., 14:05" when not today */
function preparedAt(at: number): string {
  const date = new Date(at);
  const time = date.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === new Date().toDateString()) return time;
  return `${date.toLocaleDateString(dateLocale(), { day: '2-digit', month: '2-digit' })}, ${time}`;
}

type Props = {
  eventId: string;
  event: { startDate: number; endDate: number };
  /** The organizer may renew the keys of the sellers' ID codes */
  canRenewKeys: boolean;
};

/**
 * In the app: whether the bazaar is on the device for working without internet, and
 * since when. Prepared on its own while the team works online; the button does it now.
 */
export function OfflineReadyCard({ eventId, event, canRenewKeys }: Props) {
  const { t } = useTranslation('organizer');
  const client = useApiClient();
  const { available, prepared, preparing, outdated, prepare } = useOfflinePreparation(
    eventId,
    event,
    true
  );
  const renewKeys = useMutation(api.offline.renewCheckInKeys);
  const [renewing, setRenewing] = useState(false);
  if (!available) return null;

  // The team must know when the bazaar is not on the device as the card says
  const handleRefresh = async () => {
    try {
      await prepare();
    } catch (err) {
      toast.error(
        err instanceof NotStored
          ? t('offlineReady.notStored')
          : err instanceof Incomplete
            ? t('offlineReady.incomplete')
            : getUserFacingErrorMessage(err)
      );
    }
  };

  const handleRenew = async () => {
    setRenewing(true);
    try {
      await renewKeys({ eventId: eventId as Id<'events'> });
      toast.success(t('offlineReady.renewed'));
      // This device scans offline with the new keys too, not only after the next update
      await fetchEventKeys(client, eventId).catch(() => {});
    } catch (err) {
      toast.error(getUserFacingErrorMessage(err));
    } finally {
      setRenewing(false);
    }
  };

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
                time: preparedAt(prepared.at),
              })
            : t('offlineReady.notYet')}
        {!preparing && outdated && (
          <span className="block text-amber-700 dark:text-amber-400">
            {t('offlineReady.outdated')}
          </span>
        )}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2"
        onClick={() => void handleRefresh()}
        disabled={preparing}
      >
        <RefreshCw className={preparing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        {t('offlineReady.refresh')}
      </Button>
      {canRenewKeys && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2" disabled={renewing}>
              <KeyRound className="h-4 w-4" />
              {t('offlineReady.renew')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('offlineReady.renewTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('offlineReady.renewText')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('actions.cancel', { ns: 'common' })}</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleRenew()}>
                {t('offlineReady.renew')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
