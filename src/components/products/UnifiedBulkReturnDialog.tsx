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
import { CheckCircle2, RotateCcw, Package } from 'lucide-react';

interface UnifiedBulkReturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productCount: number;
  vendorName: string;
  onConfirmReturn: () => Promise<void>;
  isSubmitting: boolean;
}

export function UnifiedBulkReturnDialog({
  open,
  onOpenChange,
  productCount,
  vendorName,
  onConfirmReturn,
  isSubmitting,
}: UnifiedBulkReturnDialogProps) {
  const [returnConfirmed, setReturnConfirmed] = useState(false);
  const [returnSuccess, setReturnSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      setReturnConfirmed(false);
      setReturnSuccess(false);
    }
  }, [open]);

  const handleReturn = async () => {
    if (!returnConfirmed) return;
    await onConfirmReturn();
    setReturnSuccess(true);
  };

  if (returnSuccess) {
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
              Rückgabe erfolgreich!
            </DialogTitle>
            <DialogDescription className="text-center text-base">
              Alle <b>{productCount}</b> Artikel von <b>{vendorName}</b> wurden als zurückgegeben
              markiert.
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Alle Artikel zurückgeben
          </DialogTitle>
          <DialogDescription>
            Bestätige die Rückgabe aller verfügbaren Artikel an den Verkäufer.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-6">
          <div className="bg-muted p-4 rounded-lg space-y-3">
            <div className="flex justify-between text-sm items-center">
              <span className="text-muted-foreground">Anzahl Artikel:</span>
              <span className="font-bold">{productCount}</span>
            </div>

            <div className="flex justify-between text-sm items-center">
              <span className="text-muted-foreground">Verkäufer:</span>
              <span className="font-medium">{vendorName}</span>
            </div>

            <div className="pt-2 border-t flex items-center gap-3 text-amber-600 dark:text-amber-400">
              <Package className="h-5 w-5 shrink-0" />
              <span className="text-sm font-medium">
                Alle Artikel physisch an Verkäufer übergeben.
              </span>
            </div>
          </div>

          <div
            className={`flex items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm cursor-pointer transition-colors ${returnConfirmed ? 'bg-primary/5 border-primary/50' : 'bg-background'}`}
            onClick={() => setReturnConfirmed(!returnConfirmed)}
          >
            <Checkbox
              id="bulk-return-confirm"
              checked={returnConfirmed}
              onCheckedChange={(checked: boolean | string) => setReturnConfirmed(!!checked)}
            />
            <div className="grid gap-1.5 leading-none cursor-pointer">
              <Label
                htmlFor="bulk-return-confirm"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Vollständige Rückgabe bestätigt
              </Label>
              <p className="text-xs text-muted-foreground">
                Ich bestätige, dass alle {productCount} Artikel dem Verkäufer (oder einer
                berechtigten Person) ausgehändigt wurden.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Abbrechen
          </Button>
          <Button
            onClick={handleReturn}
            disabled={!returnConfirmed || isSubmitting}
            className="gap-2"
          >
            {isSubmitting ? 'Wird gespeichert...' : 'Alle zurückgeben'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
