import { useState } from 'react';
import { Banknote, CheckCircle2, Info, PackageOpen } from 'lucide-react';
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
import { Button } from '../../../../../components/ui/button';
import { Checkbox } from '../../../../../components/ui/checkbox';
import { Label } from '../../../../../components/ui/label';
import { formatPriceDE } from '../../../../../lib/utils';
import type { VendorWithCalculations } from '../../../../../../convex/eventRoles';
import { Trans, useTranslation } from 'react-i18next';

const MAX_LISTED_ITEMS = 6;

interface VendorSettlementProps {
  vendor: VendorWithCalculations;
  commissionPercent: number;
  /** Unsold items still at the bazaar; they go back to the seller. */
  itemsToReturn: { _id: string; title: string }[];
  soldCount: number;
  returnedCount: number;
  /** Registered items that were never handed in. */
  notHandedInCount: number;
  isSubmitting: boolean;
  onSettle: () => Promise<void>;
  onUndo: () => Promise<void>;
}

/**
 * Settling a seller at the end of the bazaar: hand back the unsold items, pay out the
 * sales minus commission and intake fee, done. One confirmation for both.
 */
export function VendorSettlement({
  vendor,
  commissionPercent,
  itemsToReturn,
  soldCount,
  returnedCount,
  notHandedInCount,
  isSubmitting,
  onSettle,
  onUndo,
}: VendorSettlementProps) {
  const { t } = useTranslation('organizer');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);
  const [moneyBack, setMoneyBack] = useState(false);
  const name = vendor.name ?? t('settle.seller');
  // With an intake fee and few sales the seller pays the bazaar instead
  const owes = vendor.payout < -0.005;
  const amount = formatPriceDE(Math.abs(vendor.payout));
  const settledText =
    vendor.payout > 0.005
      ? t('settle.paidOut', { amount })
      : owes
        ? t('settle.feeReceived', { amount, name })
        : t('settle.nothing');
  const hasMoney = Math.abs(vendor.payout) > 0.005;

  if (vendor.paid) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">{t('settle.settled')}</p>
            <p className="text-sm">
              {settledText}
              {returnedCount > 0 && t('settle.returned', { count: returnedCount })}.
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => {
            setMoneyBack(false);
            setUndoOpen(true);
          }}
        >
          {t('settle.undo')}
        </Button>
        <AlertDialog open={undoOpen} onOpenChange={setUndoOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('settle.undoTitle')}</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>
                    {t('settle.undoText', { name })}
                    {vendor.payout > 0.005 && t('settle.undoTakeBack', { amount, name })}
                    {owes && t('settle.undoGiveBack', { amount, name })}
                  </p>
                  <p>{t('settle.undoReturned')}</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            {hasMoney && (
              <div className="flex items-start gap-3 rounded-md border p-4">
                <Checkbox
                  id="payout-money-back"
                  checked={moneyBack}
                  onCheckedChange={(checked) => setMoneyBack(!!checked)}
                  disabled={isSubmitting}
                />
                <Label htmlFor="payout-money-back" className="cursor-pointer leading-snug">
                  {owes
                    ? t('settle.gaveBack', { amount, name })
                    : t('settle.tookBack', { amount, name })}
                </Label>
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isSubmitting}>
                {t('actions.cancel', { ns: 'common' })}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={isSubmitting || (hasMoney && !moneyBack)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async (e) => {
                  e.preventDefault();
                  await onUndo();
                  setUndoOpen(false);
                }}
              >
                {t('settle.undoConfirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  const returnCount = itemsToReturn.length;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {/* Step 1: hand back */}
        <section className="rounded-xl border bg-background p-4">
          <h3 className="mb-2 flex items-center gap-2 font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">
              1
            </span>
            {t('settle.returnTitle')}
          </h3>
          {returnCount === 0 ? (
            <p className="text-sm text-muted-foreground">{t('settle.nothingToReturn')}</p>
          ) : (
            <>
              <p className="text-sm">
                <Trans
                  i18nKey="settle.goBack"
                  ns="organizer"
                  count={returnCount}
                  values={{ count: returnCount, name }}
                  components={{ b: <b /> }}
                />
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {itemsToReturn.slice(0, MAX_LISTED_ITEMS).map((item) => (
                  <li key={item._id} className="flex items-center gap-2">
                    <PackageOpen className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{item.title}</span>
                  </li>
                ))}
                {returnCount > MAX_LISTED_ITEMS && (
                  <li>{t('settle.more', { count: returnCount - MAX_LISTED_ITEMS })}</li>
                )}
              </ul>
            </>
          )}
        </section>

        {/* Step 2: pay out */}
        <section className="rounded-xl border bg-background p-4">
          <h3 className="mb-2 flex items-center gap-2 font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">
              2
            </span>
            {owes ? t('settle.collectFee') : t('settle.payOut')}
          </h3>
          <dl className="space-y-1 text-sm tabular-nums">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t('settle.sold', { count: soldCount })}</dt>
              <dd>{formatPriceDE(vendor.totalRevenue)} €</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">
                {t('settle.commission', { percent: commissionPercent })}
              </dt>
              <dd>
                {vendor.commission > 0 ? '−' : ''}
                {formatPriceDE(vendor.commission)} €
              </dd>
            </div>
            {vendor.intakeFee.total > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  {t('settle.intakeFee', {
                    items: vendor.intakeFee.items,
                    perItem: formatPriceDE(vendor.intakeFee.perItem),
                  })}
                </dt>
                <dd>−{formatPriceDE(vendor.intakeFee.total)} €</dd>
              </div>
            )}
            <div className="flex justify-between border-t pt-2 text-base font-bold">
              <dt>{owes ? t('settle.pays', { name }) : t('settle.payout')}</dt>
              <dd className={owes ? 'text-destructive' : 'text-primary'}>{amount} €</dd>
            </div>
          </dl>
        </section>
      </div>

      {notHandedInCount > 0 && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t('settle.notHandedIn', { count: notHandedInCount })}
        </p>
      )}

      <Button
        size="lg"
        className="w-full gap-2 md:w-auto"
        onClick={() => setConfirmOpen(true)}
        disabled={isSubmitting}
      >
        <Banknote className="h-5 w-5" /> {t('settle.finish')}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settle.confirmTitle', { name })}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>{t('settle.confirmText')}</p>
                <ul className="space-y-2 text-foreground">
                  {returnCount > 0 && (
                    <li className="flex items-center gap-2">
                      <PackageOpen className="h-4 w-4 text-primary" />
                      {t('settle.returnedItems', { count: returnCount })}
                    </li>
                  )}
                  <li className="flex items-center gap-2">
                    <Banknote className="h-4 w-4 text-primary" />
                    {settledText}
                  </li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>
              {t('actions.cancel', { ns: 'common' })}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isSubmitting}
              onClick={async (e) => {
                e.preventDefault();
                await onSettle();
                setConfirmOpen(false);
              }}
            >
              {isSubmitting ? t('settle.saving') : t('settle.done')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
