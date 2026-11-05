import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Printer } from 'lucide-react';
import type { Id } from '../../lib/api/types';
import { labelUrl } from '../../lib/qrCode';
import { QrCode } from '../ui/QrCode';
import { LabelPrintDialog } from './LabelPrintDialog';
import { getProductUrl } from '../../lib/utils';
import { useTranslation } from 'react-i18next';

interface ProductQRCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: Id<'products'>;
  productTitle: string;
}

/**
 * The item's QR code as on its label, and the label as PDF: with format, sorting code
 * and price rule of the item's next bazaar (labels.getLabelData).
 */
export function ProductQRCodeDialog({
  open,
  onOpenChange,
  productId,
  productTitle,
}: ProductQRCodeDialogProps) {
  const { t } = useTranslation();
  const [printing, setPrinting] = useState(false);
  const productUrl = getProductUrl(productId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('qr.title', { title: productTitle })}</DialogTitle>
          <DialogDescription>{t('qr.text')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="bg-white rounded-lg">
            <QrCode value={labelUrl(productId)} className="h-56 w-56" />
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">{t('qr.url')}</p>
            <p className="text-xs font-mono break-all bg-muted p-2 rounded">{productUrl}</p>
          </div>
          <Button onClick={() => setPrinting(true)} variant="outline" className="w-full">
            <Printer className="mr-2 h-4 w-4" />
            {t('qr.downloadLabel')}
          </Button>
        </div>
        <LabelPrintDialog open={printing} onOpenChange={setPrinting} selection={[productId]} />
      </DialogContent>
    </Dialog>
  );
}
