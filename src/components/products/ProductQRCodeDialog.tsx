import { QRCodeSVG } from 'qrcode.react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Download } from 'lucide-react';
import type { Id } from '../../../convex/_generated/dataModel';
import { getProductUrl } from '../../lib/utils';
import { downloadProductQRCodePng } from '../../lib/productQRCodePng';

const QR_CODE_ELEMENT_ID = 'product-qr-code';

interface ProductQRCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: Id<'products'>;
  productTitle: string;
}

/**
 * Dialog component that displays a QR code for a product
 * and offers download as PNG (with product name).
 */
export function ProductQRCodeDialog({
  open,
  onOpenChange,
  productId,
  productTitle,
}: ProductQRCodeDialogProps) {
  const productUrl = getProductUrl(productId);

  const handleDownload = () => {
    downloadProductQRCodePng(QR_CODE_ELEMENT_ID, productTitle);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>QR-Code für {productTitle}</DialogTitle>
          <DialogDescription>
            Scanne diesen QR-Code, um direkt zum Produkt zu gelangen.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="bg-white p-4 rounded-lg">
            <QRCodeSVG
              id={QR_CODE_ELEMENT_ID}
              value={productUrl}
              size={256}
              level="H"
              includeMargin={true}
            />
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">Produkt-URL:</p>
            <p className="text-xs font-mono break-all bg-muted p-2 rounded">{productUrl}</p>
          </div>
          <Button onClick={handleDownload} variant="outline" className="w-full">
            <Download className="mr-2 h-4 w-4" />
            QR-Code herunterladen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
