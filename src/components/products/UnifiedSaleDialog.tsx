import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { formatPriceDE } from '../../lib/utils';
import { CheckCircle2, Download, ShoppingCart } from 'lucide-react';

interface UnifiedSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productTitle: string;
  price: number;
  discountPercent?: number;
  onConfirmSale: () => Promise<boolean>;
  onDownloadInvoice: () => Promise<void>;
  isSubmitting: boolean;
}

export function UnifiedSaleDialog({
  open,
  onOpenChange,
  productTitle,
  price,
  discountPercent,
  onConfirmSale,
  onDownloadInvoice,
  isSubmitting,
}: UnifiedSaleDialogProps) {
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [saleSuccess, setSaleSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      setPaymentConfirmed(false);
      setSaleSuccess(false);
    }
  }, [open]);

  const discountAmount = discountPercent ? price * (discountPercent / 100) : 0;
  const finalPrice = price - discountAmount;

  const handleSale = async () => {
    if (!paymentConfirmed) return;
    const success = await onConfirmSale();
    if (success) {
      setSaleSuccess(true);
    }
  };

  if (saleSuccess) {
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
              Verkauf erfolgreich!
            </DialogTitle>
            <DialogDescription className="text-center text-base">
              Der Artikel <b>{productTitle}</b> wurde als verkauft markiert.
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Möchtest du jetzt die Privatrechnung für den Käufer herunterladen?
            </p>
            <Button onClick={onDownloadInvoice} className="w-full gap-2" variant="outline">
              <Download className="h-4 w-4" />
              Privatrechnung herunterladen
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} className="w-full">
              Schließen
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
            <ShoppingCart className="h-5 w-5" />
            Verkauf abwickeln
          </DialogTitle>
          <DialogDescription>
            Bitte bestätige den Erhalt der Zahlung, um den Verkauf abzuschließen.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-6">
          <div className="bg-muted p-4 rounded-lg space-y-3">
            <div className="flex justify-between text-sm items-center">
              <span className="text-muted-foreground">Artikel:</span>
              <span className="font-medium truncate max-w-[200px]" title={productTitle}>
                {productTitle}
              </span>
            </div>

            {discountPercent && discountPercent > 0 ? (
              <>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-muted-foreground">Originalpreis:</span>
                  <span>{formatPriceDE(price)} €</span>
                </div>
                <div className="flex justify-between text-sm items-center text-destructive">
                  <span className="text-muted-foreground text-destructive">
                    Rabatt (-{discountPercent}%):
                  </span>
                  <span>-{formatPriceDE(discountAmount)} €</span>
                </div>
              </>
            ) : null}

            <div className="pt-2 border-t flex justify-between items-center">
              <span className="text-lg font-bold">Zu kassieren:</span>
              <span className="text-2xl font-black text-primary">
                {formatPriceDE(finalPrice)} €
              </span>
            </div>
          </div>

          <div
            className={`flex items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm cursor-pointer transition-colors ${paymentConfirmed ? 'bg-primary/5 border-primary/50' : 'bg-background'}`}
            onClick={() => setPaymentConfirmed(!paymentConfirmed)}
          >
            <Checkbox
              id="payment-confirm"
              checked={paymentConfirmed}
              onCheckedChange={(checked: boolean | string) => setPaymentConfirmed(!!checked)}
            />
            <div className="grid gap-1.5 leading-none cursor-pointer">
              <Label
                htmlFor="payment-confirm"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Betrag von {formatPriceDE(finalPrice)} € erhalten
              </Label>
              <p className="text-xs text-muted-foreground">
                Bestätige, dass der Käufer den vollen Betrag bar oder per Zahlungsmethode beglichen
                hat.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Abbrechen
          </Button>
          <Button
            onClick={handleSale}
            disabled={!paymentConfirmed || isSubmitting}
            className="gap-2"
          >
            {isSubmitting ? 'Wird gespeichert...' : 'Verkauf abschließen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
