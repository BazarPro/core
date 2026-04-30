import { CheckCircle2, QrCode, RotateCcw, ShoppingCart, Undo2, UserCircle } from 'lucide-react';
import { Button } from '../../../../../components/ui/button';
import { ConvexImage } from '../../../../../components/ui/ConvexImage';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../../../components/ui/dialog';
import { formatPriceDE } from '../../../../../lib/utils';
import type { Id } from '../../../../../../convex/_generated/dataModel';
import type { InventoryActionType } from '../../../../../hooks/useInventoryActions';
import type { ScanResult } from './inventoryTypes';

interface InventoryScanResultDialogProps {
  eventId: Id<'events'>;
  open: boolean;
  scanResult: ScanResult | null;
  isSubmitting: boolean;
  isUndoInventoryActionsEnabled: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
  onNavigateToProduct: (productId: Id<'products'>) => void;
  onNavigateToUserProfile: (userId: Id<'users'>) => void;
  onTriggerConfirm: (
    type: InventoryActionType,
    eventProductId: Id<'eventProducts'>,
    productTitle: string,
    price: number,
    discountPercent?: number
  ) => void;
  onMarkAllAvailable: (
    eventId: Id<'events'>,
    vendorId: Id<'users'>,
    onSuccess?: () => void
  ) => void;
}

export function InventoryScanResultDialog({
  eventId,
  open,
  scanResult,
  isSubmitting,
  isUndoInventoryActionsEnabled,
  onOpenChange,
  onClose,
  onNavigateToProduct,
  onNavigateToUserProfile,
  onTriggerConfirm,
  onMarkAllAvailable,
}: InventoryScanResultDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-md overflow-hidden">
        {scanResult?.type === 'product' && (
          <>
            <DialogHeader>
              <DialogTitle className="pr-6">Produkt gefunden</DialogTitle>
              <DialogDescription>Wähle eine Aktion für dieses Produkt aus.</DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div
                className="bg-muted p-3 sm:p-4 rounded-xl flex items-start gap-3 sm:gap-4 cursor-pointer hover:bg-muted/80 transition-colors border border-transparent hover:border-primary/20 group overflow-hidden"
                onClick={() => onNavigateToProduct(scanResult.data.productId)}
              >
                <div className="h-16 w-16 bg-background rounded-lg flex items-center justify-center border overflow-hidden shrink-0">
                  {scanResult.data.product.images?.[0] ? (
                    <ConvexImage
                      storageId={scanResult.data.product.images[0]}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <QrCode className="h-8 w-8 text-muted-foreground/40" />
                  )}
                </div>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <h4 className="font-bold text-base sm:text-lg leading-tight group-hover:text-primary transition-colors break-all hyphens-auto">
                    {scanResult.data.product.title}
                  </h4>
                  <p className="text-xs sm:text-sm text-muted-foreground truncate mt-1">
                    {scanResult.data.vendor?.name || 'Unbekannter Verkäufer'}
                  </p>
                  <div className="flex flex-col mt-1">
                    {scanResult.data.discountPercent ? (
                      <>
                        <p className="text-xs text-muted-foreground line-through">
                          {formatPriceDE(scanResult.data.product.price)} €
                        </p>
                        <p className="text-destructive font-bold text-sm sm:text-base">
                          {formatPriceDE(
                            scanResult.data.product.price *
                              (1 - scanResult.data.discountPercent / 100)
                          )}{' '}
                          €
                        </p>
                      </>
                    ) : (
                      <p className="text-primary font-bold text-sm sm:text-base">
                        {formatPriceDE(scanResult.data.product.price)} €
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {scanResult.data.status === 'announced' && (
                  <Button
                    className="w-full gap-2 h-12 text-base"
                    onClick={() =>
                      onTriggerConfirm(
                        'markAvailable',
                        scanResult.data._id,
                        scanResult.data.product.title,
                        scanResult.data.product.price,
                        scanResult.data.discountPercent
                      )
                    }
                    disabled={isSubmitting}
                  >
                    <CheckCircle2 className="h-5 w-5" />
                    Als verfügbar markieren
                  </Button>
                )}
                {scanResult.data.status === 'available' && (
                  <>
                    <Button
                      className="w-full gap-2 h-12 text-base bg-green-600 hover:bg-green-700"
                      onClick={() =>
                        onTriggerConfirm(
                          'sell',
                          scanResult.data._id,
                          scanResult.data.product.title,
                          scanResult.data.product.price,
                          scanResult.data.discountPercent
                        )
                      }
                      disabled={isSubmitting}
                    >
                      <ShoppingCart className="h-5 w-5" />
                      Direkt verkaufen
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full gap-2 h-12 text-base"
                      onClick={() =>
                        onTriggerConfirm(
                          'return',
                          scanResult.data._id,
                          scanResult.data.product.title,
                          scanResult.data.product.price,
                          scanResult.data.discountPercent
                        )
                      }
                      disabled={isSubmitting}
                    >
                      <RotateCcw className="h-5 w-5" />
                      An Nutzer zurückgeben
                    </Button>
                  </>
                )}
                {scanResult.data.status === 'sold' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 p-3 bg-green-50 text-green-800 rounded-lg border border-green-200">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium text-green-800">
                        Dieses Produkt wurde bereits verkauft.
                      </span>
                    </div>
                    {isUndoInventoryActionsEnabled && (
                      <Button
                        variant="outline"
                        className="w-full gap-2 h-12 text-base border-destructive text-destructive hover:bg-destructive/5"
                        onClick={() =>
                          onTriggerConfirm(
                            'undoSale',
                            scanResult.data._id,
                            scanResult.data.product.title,
                            scanResult.data.product.price,
                            scanResult.data.discountPercent
                          )
                        }
                        disabled={isSubmitting}
                      >
                        <Undo2 className="h-5 w-5" />
                        Verkauf stornieren
                      </Button>
                    )}
                  </div>
                )}
                {scanResult.data.status === 'returned' && isUndoInventoryActionsEnabled && (
                  <Button
                    variant="outline"
                    className="w-full gap-2 h-12 text-base"
                    onClick={() =>
                      onTriggerConfirm(
                        'undoReturn',
                        scanResult.data._id,
                        scanResult.data.product.title,
                        scanResult.data.product.price,
                        scanResult.data.discountPercent
                      )
                    }
                    disabled={isSubmitting}
                  >
                    <Undo2 className="h-5 w-5" />
                    Rückgabe rückgängig machen
                  </Button>
                )}
              </div>
            </div>
          </>
        )}

        {scanResult?.type === 'user' && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <UserCircle className="h-5 w-5 text-primary" />
                <DialogTitle>Nutzer identifiziert</DialogTitle>
              </div>
              <DialogDescription>
                {scanResult.data.user.name} ({scanResult.data.user.email})
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              {!scanResult.data.isRegisteredInEvent && (
                <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  Dieser Nutzer ist nicht für dieses Event angemeldet.
                </div>
              )}

              {scanResult.data.isRegisteredInEvent && (
                <Button
                  variant="outline"
                  className="w-full mb-4"
                  onClick={() => onNavigateToUserProfile(scanResult.data.user._id)}
                >
                  Zum Nutzerprofil
                </Button>
              )}

              <div className="space-y-3 mb-6 max-h-[300px] overflow-y-auto pr-2">
                <h4 className="text-sm font-semibold sticky top-0 bg-background py-1">
                  Angekündigte Produkte ({scanResult.data.products.length})
                </h4>
                {scanResult.data.products.map((p) => (
                  <div
                    key={p._id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border"
                  >
                    <span className="text-sm font-medium truncate flex-1 mr-2">{p.title}</span>
                    <span className="text-sm font-bold shrink-0">{formatPriceDE(p.price)} €</span>
                  </div>
                ))}
                {scanResult.data.products.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Keine ausstehenden Produkte für dieses Event.
                  </p>
                )}
              </div>

              {scanResult.data.isRegisteredInEvent && scanResult.data.products.length > 0 && (
                <Button
                  className="w-full gap-2 h-12 text-base"
                  onClick={() => onMarkAllAvailable(eventId, scanResult.data.user._id, onClose)}
                  disabled={isSubmitting}
                >
                  <CheckCircle2 className="h-5 w-5" />
                  Alle {scanResult.data.products.length} Produkte annehmen
                </Button>
              )}
            </div>
          </>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Schließen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
