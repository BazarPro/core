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
 * sales minus commission, done. One confirmation for both.
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);
  const [moneyBack, setMoneyBack] = useState(false);
  const name = vendor.name ?? 'Verkäufer';

  if (vendor.paid) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Abgerechnet</p>
            <p className="text-sm">
              {formatPriceDE(vendor.payout)} € ausgezahlt
              {returnedCount > 0 && `, ${returnedCount} Artikel zurückgegeben`}.
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
          Abrechnung zurücknehmen
        </Button>
        <AlertDialog open={undoOpen} onOpenChange={setUndoOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Abrechnung wirklich zurücknehmen?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>
                    {name} gilt danach wieder als nicht ausgezahlt.
                    {vendor.payout > 0 &&
                      ` Nimm dafür die ausgezahlten ${formatPriceDE(vendor.payout)} € von ${name} wieder entgegen, sonst stimmt die Kasse nicht.`}
                  </p>
                  <p>
                    Zurückgegebene Artikel bleiben zurückgegeben. Danach kannst du Verkäufe und
                    Rückgaben wieder korrigieren und rechnest am Ende erneut ab.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            {vendor.payout > 0 && (
              <div className="flex items-start gap-3 rounded-md border p-4">
                <Checkbox
                  id="payout-money-back"
                  checked={moneyBack}
                  onCheckedChange={(checked) => setMoneyBack(!!checked)}
                  disabled={isSubmitting}
                />
                <Label htmlFor="payout-money-back" className="cursor-pointer leading-snug">
                  {formatPriceDE(vendor.payout)} € von {name} zurückerhalten
                </Label>
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isSubmitting}>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                disabled={isSubmitting || (vendor.payout > 0 && !moneyBack)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async (e) => {
                  e.preventDefault();
                  await onUndo();
                  setUndoOpen(false);
                }}
              >
                Ja, Abrechnung zurücknehmen
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
            Unverkaufte Artikel zurückgeben
          </h3>
          {returnCount === 0 ? (
            <p className="text-sm text-muted-foreground">Nichts zurückzugeben.</p>
          ) : (
            <>
              <p className="text-sm">
                <b>{returnCount}</b> {returnCount === 1 ? 'Artikel geht' : 'Artikel gehen'} an{' '}
                {name} zurück:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {itemsToReturn.slice(0, MAX_LISTED_ITEMS).map((item) => (
                  <li key={item._id} className="flex items-center gap-2">
                    <PackageOpen className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{item.title}</span>
                  </li>
                ))}
                {returnCount > MAX_LISTED_ITEMS && (
                  <li>… und {returnCount - MAX_LISTED_ITEMS} weitere (siehe Liste unten)</li>
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
            Geld auszahlen
          </h3>
          <dl className="space-y-1 text-sm tabular-nums">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Verkauft ({soldCount} Artikel)</dt>
              <dd>{formatPriceDE(vendor.totalRevenue)} €</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Provision ({commissionPercent} %)</dt>
              <dd>
                {vendor.commission > 0 ? '−' : ''}
                {formatPriceDE(vendor.commission)} €
              </dd>
            </div>
            <div className="flex justify-between border-t pt-2 text-base font-bold">
              <dt>Auszahlung</dt>
              <dd className="text-primary">{formatPriceDE(vendor.payout)} €</dd>
            </div>
          </dl>
        </section>
      </div>

      {notHandedInCount > 0 && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {notHandedInCount} angemeldete{' '}
          {notHandedInCount === 1 ? 'Artikel wurde' : 'Artikel wurden'} nie abgegeben und
          {notHandedInCount === 1 ? ' bleibt' : ' bleiben'} bei der Abrechnung außen vor.
        </p>
      )}

      <Button
        size="lg"
        className="w-full gap-2 md:w-auto"
        onClick={() => setConfirmOpen(true)}
        disabled={isSubmitting}
      >
        <Banknote className="h-5 w-5" /> Abrechnung abschließen
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abrechnung für {name}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Bitte bestätige, dass du Folgendes erledigt hast:</p>
                <ul className="space-y-2 text-foreground">
                  {returnCount > 0 && (
                    <li className="flex items-center gap-2">
                      <PackageOpen className="h-4 w-4 text-primary" />
                      {returnCount} unverkaufte Artikel zurückgegeben
                    </li>
                  )}
                  <li className="flex items-center gap-2">
                    <Banknote className="h-4 w-4 text-primary" />
                    {vendor.payout > 0
                      ? `${formatPriceDE(vendor.payout)} € ausgezahlt`
                      : 'Nichts auszuzahlen'}
                  </li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              disabled={isSubmitting}
              onClick={async (e) => {
                e.preventDefault();
                await onSettle();
                setConfirmOpen(false);
              }}
            >
              {isSubmitting ? 'Wird gespeichert…' : 'Erledigt, abschließen'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
