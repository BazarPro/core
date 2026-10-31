import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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

type Props = {
  /** What the backend answered, e.g. "no access to this event" */
  message: string;
  /** Text of what waits, e.g. "3 offline actions are waiting." */
  pending: string;
  retry: () => void;
  /** Drops the queue; left out where it holds sales, which must not get lost */
  discard?: () => Promise<void>;
};

/**
 * The backend refuses to take what the device did offline, and trying again alone will
 * not change it (offlineMode.isPermanentRefusal): the team decides.
 */
export function OfflineQueueRefused({ message, pending, retry, discard }: Props) {
  const { t } = useTranslation('organizer');
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-destructive"
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="font-semibold">{pending}</p>
        <p className="text-sm">{t('offlineQueue.refused', { message })}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={retry}>
            {t('offlineQueue.retry')}
          </Button>
          {discard && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm">
                  {t('offlineQueue.discard')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('offlineQueue.discardTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>{t('offlineQueue.discardText')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('actions.cancel', { ns: 'common' })}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void discard()}>
                    {t('offlineQueue.discard')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </div>
  );
}
