import { Bluetooth, LogOut, Nfc } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '../../../../../components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../../../components/ui/alert-dialog';
import { getUserFacingErrorMessage } from '../../../../../lib/errors';
import { formatPriceDE } from '../../../../../lib/utils';
import type { SumUpState } from '../../../../../native/sumup';

/**
 * SumUp on this device, under the payment method "card": logging in with the
 * organizer's SumUp account, the reader or Tap to Pay. Without a login the desk records
 * the card payment by hand, as with any other terminal.
 */
export function SumUpPanel({ sumUp, disabled }: { sumUp: SumUpState; disabled: boolean }) {
  const { t } = useTranslation('organizer');
  const busy = disabled || sumUp.busy;
  const act = (action: () => Promise<void>) => () =>
    void action().catch((error: unknown) => toast.error(getUserFacingErrorMessage(error)));

  if (sumUp.loggedIn === null) {
    return <p className="text-xs text-muted-foreground">{t('checkout.sumup.checking')}</p>;
  }
  if (!sumUp.loggedIn) {
    return (
      <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
        <p className="min-w-0 flex-1 basis-48 text-xs text-muted-foreground">
          {t('checkout.sumup.loggedOut')}
        </p>
        <Button size="sm" variant="outline" disabled={busy} onClick={act(sumUp.login)}>
          {t('checkout.sumup.login')}
        </Button>
      </div>
    );
  }
  return (
    <div className="w-full space-y-2 rounded-lg border bg-card p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {t('checkout.sumup.connected', { merchant: sumUp.merchantCode ?? '' })}
        </p>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5 px-2 text-xs"
          disabled={busy}
          onClick={act(sumUp.logout)}
        >
          <LogOut className="h-3.5 w-3.5" />
          {t('checkout.sumup.logout')}
        </Button>
      </div>
      {sumUp.tapToPay.available && (
        <div
          role="radiogroup"
          aria-label={t('checkout.sumup.device')}
          className="grid grid-cols-2 gap-2"
        >
          {[false, true].map((tapToPay) => (
            <Button
              key={String(tapToPay)}
              type="button"
              role="radio"
              size="sm"
              aria-checked={sumUp.tapToPay.selected === tapToPay}
              variant={sumUp.tapToPay.selected === tapToPay ? 'secondary' : 'outline'}
              className="h-auto min-h-8 gap-1.5 whitespace-normal"
              disabled={busy}
              onClick={() => sumUp.selectTapToPay(tapToPay)}
            >
              {tapToPay ? <Nfc className="h-4 w-4" /> : <Bluetooth className="h-4 w-4" />}
              {tapToPay ? sumUp.tapToPay.name : t('checkout.sumup.reader')}
            </Button>
          ))}
        </div>
      )}
      {!sumUp.tapToPay.selected && (
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1.5"
          disabled={busy}
          onClick={act(sumUp.openReaderSettings)}
        >
          <Bluetooth className="h-4 w-4" />
          {t('checkout.sumup.readerSettings')}
        </Button>
      )}
    </div>
  );
}

/**
 * SumUp lost the reply: the card may have been charged. The cashier looks it up in the
 * SumUp app; only they can say whether the sale is paid.
 */
export function SumUpUnclearDialog({
  total,
  open,
  booking,
  onPaid,
  onNotPaid,
}: {
  total: number;
  open: boolean;
  booking: boolean;
  onPaid: () => void;
  onNotPaid: () => void;
}) {
  const { t } = useTranslation('organizer');
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !booking && onNotPaid()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('checkout.sumup.unclearTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('checkout.sumup.unclearText', { total: formatPriceDE(total) })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={booking}>{t('checkout.sumup.notPaid')}</AlertDialogCancel>
          <AlertDialogAction
            loading={booking}
            disabled={booking}
            onClick={(event) => {
              // Stays open while the sale is booked
              event.preventDefault();
              onPaid();
            }}
          >
            {t('checkout.sumup.paid')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
