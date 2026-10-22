import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Printer } from 'lucide-react';
import { toast } from 'sonner';
import type { Id } from '../../lib/api/types';
import { useApiClient } from '../../lib/api/react';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { labelUrl } from '../../lib/labelQr';
import { downloadLabelsPdf } from '../../lib/productQRCodePdf';
import { getProductUrl } from '../../lib/utils';
import { useTranslation } from 'react-i18next';

interface ProductQRCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: Id<'products'>;
  productTitle: string;
}

/**
 * The item's QR code as on its label, and the label as PDF: with format, seller number
 * and price rule of the item's next bazaar (labels.getLabelData).
 */
export function ProductQRCodeDialog({
  open,
  onOpenChange,
  productId,
  productTitle,
}: ProductQRCodeDialogProps) {
  const { t } = useTranslation();
  const client = useApiClient();
  const [isCreating, setIsCreating] = useState(false);
  const productUrl = getProductUrl(productId);

  const handleDownload = async () => {
    setIsCreating(true);
    try {
      await downloadLabelsPdf(client, [productId]);
    } catch (e) {
      toast.error(getUserFacingErrorMessage(e));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('qr.title', { title: productTitle })}</DialogTitle>
          <DialogDescription>{t('qr.text')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="bg-white p-4 rounded-lg">
            <QRCodeSVG value={labelUrl(productId)} size={224} level="M" marginSize={2} />
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">{t('qr.url')}</p>
            <p className="text-xs font-mono break-all bg-muted p-2 rounded">{productUrl}</p>
          </div>
          <Button
            onClick={() => void handleDownload()}
            variant="outline"
            className="w-full"
            disabled={isCreating}
          >
            <Printer className="mr-2 h-4 w-4" />
            {t('qr.downloadLabel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
