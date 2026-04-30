import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../../../../../components/ui/dialog';
import { Button } from '../../../../../components/ui/button';
import { Checkbox } from '../../../../../components/ui/checkbox';
import { Label } from '../../../../../components/ui/label';
import { formatPriceDE } from '../../../../../lib/utils';
import { CheckCircle2, Banknote, History } from 'lucide-react';

interface UnifiedPayoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorName: string;
  totalRevenue: number;
  commissionAmount: number;
  payoutAmount: number;
  onConfirmPayout: () => Promise<void>;
  isSubmitting: boolean;
  mode: 'markPaid' | 'unmarkPaid';
}

export function UnifiedPayoutDialog({
  open,
  onOpenChange,
  vendorName,
  totalRevenue,
  commissionAmount,
  payoutAmount,
  onConfirmPayout,
  isSubmitting,
  mode,
}: UnifiedPayoutDialogProps) {
  const [payoutConfirmed, setPayoutConfirmed] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      setPayoutConfirmed(false);
      setSuccess(false);
    }
  }, [open]);

  const handleAction = async () => {
    if (mode === 'markPaid' && !payoutConfirmed) return;
    await onConfirmPayout();
    setSuccess(true);
  };

  if (success) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px] text-center py-10">
          <div className="flex justify-center mb-4">
            <div className="bg-green-100 p-3 rounded-full dark:bg-green-900/30">
              <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <DialogHeader>
            <DialogTitle className="text-center text-2xl font-bold">
              {mode === 'markPaid' ? 'Auszahlung erfolgt!' : 'Status zurückgesetzt!'}
            </DialogTitle>
            <DialogDescription className="text-center text-base">
              Der Status für <b>{vendorName}</b> wurde erfolgreich aktualisiert.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <Button onClick={() => onOpenChange(false)} className="w-full">
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (mode === 'unmarkPaid') {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Status zurücksetzen
            </DialogTitle>
            <DialogDescription>
              Möchtest du den Auszahlungsstatus für <b>{vendorName}</b> wieder auf
              &quot;ausstehend&quot; setzen?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <div className="flex justify-between text-sm items-center">
                <span className="text-muted-foreground">Betrag:</span>
                <span className="font-bold text-lg">{formatPriceDE(payoutAmount)} €</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Abbrechen
            </Button>
            <Button variant="destructive" onClick={handleAction} disabled={isSubmitting}>
              {isSubmitting ? 'Wird verarbeitet...' : 'Status zurücksetzen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Auszahlung bestätigen
          </DialogTitle>
          <DialogDescription>
            Bitte bestätige, dass du den Betrag an <b>{vendorName}</b> ausgezahlt hast.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-6">
          <div className="bg-muted p-4 rounded-lg space-y-3">
            <div className="flex justify-between text-sm items-center">
              <span className="text-muted-foreground">Gesamtumsatz:</span>
              <span>{formatPriceDE(totalRevenue)} €</span>
            </div>
            <div className="flex justify-between text-sm items-center">
              <span className="text-muted-foreground">Abzüglich Provision:</span>
              <span>-{formatPriceDE(commissionAmount)} €</span>
            </div>

            <div className="pt-2 border-t flex justify-between items-center">
              <span className="text-lg font-bold">Auszahlungsbetrag:</span>
              <span className="text-2xl font-black text-primary">
                {formatPriceDE(payoutAmount)} €
              </span>
            </div>
          </div>

          <div
            className={`flex items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm cursor-pointer transition-colors ${payoutConfirmed ? 'bg-primary/5 border-primary/50' : 'bg-background'}`}
            onClick={() => setPayoutConfirmed(!payoutConfirmed)}
          >
            <Checkbox
              id="payout-confirm"
              checked={payoutConfirmed}
              onCheckedChange={(checked: boolean | string) => setPayoutConfirmed(!!checked)}
            />
            <div className="grid gap-1.5 leading-none cursor-pointer">
              <Label
                htmlFor="payout-confirm"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Betrag von {formatPriceDE(payoutAmount)} € ausgezahlt
              </Label>
              <p className="text-xs text-muted-foreground">
                Ich bestätige, dass der Verkäufer das Geld erhalten hat.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Abbrechen
          </Button>
          <Button
            onClick={handleAction}
            disabled={!payoutConfirmed || isSubmitting}
            className="gap-2"
          >
            {isSubmitting ? 'Wird gespeichert...' : 'Auszahlung abschließen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
