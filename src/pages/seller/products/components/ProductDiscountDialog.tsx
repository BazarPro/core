import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../../../../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../../components/ui/alert-dialog';
import { Button } from '../../../../components/ui/button';
import { Label } from '../../../../components/ui/label';
import { formatPriceDE } from '../../../../lib/utils';
import { AlertCircle } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

interface ProductDiscountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productTitle: string;
  originalPrice: number;
  currentDiscount: number;
  onSave: (discount: number) => Promise<void>;
  isSaving: boolean;
  /** Highest discount the event allows (default 50). */
  maxDiscount?: number;
}

export function ProductDiscountDialog({
  open,
  onOpenChange,
  productTitle,
  originalPrice,
  currentDiscount,
  onSave,
  isSaving,
  maxDiscount = 50,
}: ProductDiscountDialogProps) {
  const { t } = useTranslation('seller');
  const [discount, setDiscount] = useState(currentDiscount);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      setDiscount(currentDiscount);
    }
  }, [open, currentDiscount]);

  const discountedPrice = originalPrice * (1 - discount / 100);
  // Discounts never go down. If the organizer lowered the maximum below the current
  // discount, the discount stays as it is and cannot be raised any further.
  const atMaximum = currentDiscount >= maxDiscount;
  // The range input counts its steps from `min`, so 5 % steps only work from a multiple of 5.
  const step = maxDiscount % 5 === 0 && currentDiscount % 5 === 0 ? 5 : 1;

  const handleRequestSave = () => {
    setShowConfirm(true);
  };

  const handleConfirmSave = async () => {
    await onSave(discount);
    setShowConfirm(false);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t('discountDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('discountDialog.description', { title: productTitle, max: maxDiscount })}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-3 flex gap-3 text-sm text-amber-800 dark:text-amber-200">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p>
                <Trans
                  i18nKey="discountDialog.onlyIncrease"
                  ns="seller"
                  components={{ b: <b /> }}
                />
              </p>
            </div>

            {atMaximum ? (
              <p className="text-sm text-muted-foreground">
                {t('discountDialog.atMaximum', { current: currentDiscount, max: maxDiscount })}
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="discount-slider">
                    {t('discountDialog.discount', { percent: discount })}
                  </Label>
                  <span className="text-sm font-medium text-destructive">
                    -{formatPriceDE(originalPrice - discountedPrice)} €
                  </span>
                </div>
                <input
                  id="discount-slider"
                  type="range"
                  min={currentDiscount}
                  max={maxDiscount}
                  step={step}
                  value={discount}
                  onChange={(e) => setDiscount(parseInt(e.target.value))}
                  className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground px-1">
                  <span>{currentDiscount}%</span>
                  <span>{Math.max(currentDiscount, Math.round(maxDiscount / 2))}%</span>
                  <span>{maxDiscount}%</span>
                </div>
              </div>
            )}
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span>{t('discountDialog.originalPrice')}</span>
                <span>{formatPriceDE(originalPrice)} €</span>
              </div>
              <div className="flex justify-between font-bold text-lg">
                <span>{t('discountDialog.newPrice')}</span>
                <span className={discount > 0 ? 'text-destructive' : ''}>
                  {formatPriceDE(discountedPrice)} €
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              {t('actions.cancel', { ns: 'common' })}
            </Button>
            <Button
              onClick={handleRequestSave}
              disabled={isSaving || atMaximum || discount === currentDiscount}
            >
              {t('discountDialog.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('discountDialog.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              <Trans
                i18nKey="discountDialog.confirmText"
                ns="seller"
                values={{
                  title: productTitle,
                  percent: discount,
                  price: formatPriceDE(discountedPrice),
                }}
                components={{ b: <b />, br: <br /> }}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>
              {t('actions.cancel', { ns: 'common' })}
            </AlertDialogCancel>
            <AlertDialogAction
              loading={isSaving}
              onClick={(e) => {
                e.preventDefault();
                handleConfirmSave();
              }}
              disabled={isSaving}
            >
              {isSaving ? t('discountDialog.saving') : t('discountDialog.apply')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
