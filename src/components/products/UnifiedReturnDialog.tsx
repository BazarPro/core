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
import { CheckCircle2, HandHelping, Package } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

interface UnifiedReturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productTitle: string;
  vendorName?: string;
  onConfirmReturn: () => Promise<boolean>;
  isSubmitting: boolean;
}

export function UnifiedReturnDialog({
  open,
  onOpenChange,
  productTitle,
  vendorName,
  onConfirmReturn,
  isSubmitting,
}: UnifiedReturnDialogProps) {
  const { t } = useTranslation('organizer');
  const [returnSuccess, setReturnSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      setReturnSuccess(false);
    }
  }, [open]);

  const handleReturn = async () => {
    const success = await onConfirmReturn();
    if (success) {
      setReturnSuccess(true);
    }
  };

  if (returnSuccess) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md text-center py-10">
          <div className="flex justify-center mb-4">
            <div className="bg-success-soft p-3 rounded-full">
              <CheckCircle2 className="h-10 w-10 text-success-soft-foreground" />
            </div>
          </div>
          <DialogHeader>
            <DialogTitle className="text-center text-2xl font-bold">
              {t('returnDialog.done')}
            </DialogTitle>
            <DialogDescription className="text-center text-base">
              <Trans
                i18nKey="returnDialog.doneText"
                ns="organizer"
                values={{ title: productTitle }}
                components={{ b: <b /> }}
              />
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} className="w-full">
              {t('returnDialog.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandHelping className="h-5 w-5" />
            {t('returnDialog.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-6">
          <div className="bg-muted p-4 rounded-lg space-y-3">
            <div className="flex justify-between text-sm items-center">
              <span className="text-muted-foreground">{t('returnDialog.item')}</span>
              <span className="font-medium truncate max-w-[200px]" title={productTitle}>
                {productTitle}
              </span>
            </div>

            {vendorName && (
              <div className="flex justify-between text-sm items-center">
                <span className="text-muted-foreground">{t('returnDialog.seller')}</span>
                <span className="font-medium">{vendorName}</span>
              </div>
            )}

            <div className="pt-2 border-t flex items-center gap-3 text-warning-soft-foreground">
              <Package className="h-5 w-5 shrink-0" />
              <span className="text-sm font-medium">{t('returnDialog.handOver')}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('actions.cancel', { ns: 'common' })}
          </Button>
          <Button
            loading={isSubmitting}
            onClick={handleReturn}
            disabled={isSubmitting}
            className="gap-2"
          >
            {isSubmitting ? t('returnDialog.saving') : t('returnDialog.finish')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
