import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '../../../../components/ui/button';
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
} from '../../../../components/ui/alert-dialog';
import { api } from '../../../../lib/api/functions';
import { useMutation, useOptionalQuery } from '../../../../lib/api/react';
import type { Id } from '../../../../lib/api/types';
import { getUserFacingErrorMessage } from '../../../../lib/errors';
import { useSumUpConnect, useSumUpReturn } from '../../../../native/sumup';
import { useSumUpReturnToast } from './useSumUpReturnToast';

/**
 * The SumUp account of the event, under "card payments": on a server with SumUp's OAuth
 * the organizer connects it here once, and every desk of the team charges it. Shows
 * nothing on a server without, where each device logs in at the desk.
 */
export function SumUpConnectionSettings({ eventId }: { eventId: Id<'events'> }) {
  const { t } = useTranslation('organizer');
  const connection = useOptionalQuery(api.sumup.getConnection, { eventId });
  const connect = useSumUpConnect();
  const disconnect = useMutation(api.sumup.disconnect);
  const [busy, setBusy] = useState(false);
  const {
    formState: { isDirty },
  } = useFormContext();
  useSumUpReturn(useSumUpReturnToast());

  if (!connection?.oauth) return null;

  const act = (action: () => Promise<unknown>) => async () => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  if (!connection.connected) {
    if (!connection.mine) {
      return (
        <p className="text-sm text-muted-foreground">{t('features.sumup.organizerConnects')}</p>
      );
    }
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">{t('features.sumup.connectText')}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          // On the web SumUp opens on this page; unsaved settings would be lost
          disabled={busy || isDirty}
          onClick={() => void act(connect)()}
        >
          {t('features.sumup.connect')}
        </Button>
        {isDirty && (
          <p className="text-xs text-muted-foreground">{t('features.sumup.saveFirst')}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="min-w-0 flex-1 basis-48 text-sm text-muted-foreground">
        {connection.merchantCode
          ? t('features.sumup.connected', { merchant: connection.merchantCode })
          : t('features.sumup.connectedNoCode')}
      </p>
      {connection.mine && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={busy}>
              {t('features.sumup.disconnect')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('features.sumup.disconnectTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('features.sumup.disconnectText')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('features.sumup.keep')}</AlertDialogCancel>
              <AlertDialogAction onClick={() => void act(() => disconnect({}))()}>
                {t('features.sumup.disconnect')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
