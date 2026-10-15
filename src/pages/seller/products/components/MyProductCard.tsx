import type { Id } from '../../../../../convex/_generated/dataModel';
import { useRef, type PointerEvent } from 'react';
import { Download, Percent, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../../../components/ui/alert-dialog';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Checkbox } from '../../../../components/ui/checkbox';
import { ImageWithFallback } from '../../../../components/ui/image-with-fallback';
import { formatPriceDE, cn } from '../../../../lib/utils';
import { getDiscountButtonState } from '../../../../lib/discountRules';
import type { DiscountRules } from '../../../../../convex/products';
import type { SaleInfo } from '../../../../../convex/sales';
import { priceSourceLabel, type InvoiceCopy } from '../../../../lib/saleBreakdown';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../../components/ui/dropdown-menu';
import { useTranslation } from 'react-i18next';

/**
 * Single product card for the "My Products" list: image, title, description, price, category + action buttons
 */

export interface MyProductCardProduct {
  _id: Id<'products'>;
  title: string;
  description: string;
  images: Id<'_storage'>[];
  eventIds?: string[];
  imageSrc?: string;
  price: number;
  productCategory: Id<'categories'>;
  sold: boolean;
  isLocked: boolean;
  /** Locked products become deletable once their bazaar is over */
  canDelete?: boolean;
  isAvailable?: boolean;
  discountRules?: DiscountRules;
  pendingOfferCount?: number;
  unansweredQuestionCount?: number;
  moderation?: { reason: string };
  /** Sold items: what the buyer paid, the fee and the payout. */
  sale?: SaleInfo;
}

interface MyProductCardProps {
  product: MyProductCardProduct;
  categoryLabel: string | undefined;
  isSelected: boolean;
  onToggleSelect: (id: Id<'products'>) => void;
  onEdit: (id: Id<'products'>) => void;
  onDelete?: (id: Id<'products'>) => void;
  onDownloadPrivateInvoice: (product: MyProductCardProduct, copy: InvoiceCopy) => void;
  onViewQR: (id: Id<'products'>, title: string) => void;
  onCardClick: (id: Id<'products'>) => void;
  onUpdateDiscount?: (id: Id<'products'>) => void;
  discountPercent?: number;
  isOngoingEvent?: boolean;
  bulkSelectionEnabled?: boolean;
  selectionLocked?: boolean;
  onLongPress?: (id: Id<'products'>) => void;
  /** Optional onboarding target id (e.g. for first product in list) */
  dataOnboardingId?: string;
  /** Optional onboarding target id specifically for the QR button */
  qrOnboardingId?: string;
}

export function MyProductCard({
  product,
  categoryLabel,
  isSelected,
  onToggleSelect,
  onEdit,
  onDelete,
  onDownloadPrivateInvoice,
  onViewQR,
  onCardClick,
  onUpdateDiscount,
  discountPercent,
  isOngoingEvent = false,
  bulkSelectionEnabled = false,
  selectionLocked = false,
  onLongPress,
  dataOnboardingId,
  qrOnboardingId,
}: MyProductCardProps) {
  const { t } = useTranslation('seller');
  const longPressTimer = useRef<number | null>(null);
  const longPressTriggered = useRef(false);

  const startLongPress = (event: PointerEvent<HTMLDivElement>) => {
    if (!onLongPress || bulkSelectionEnabled) return;
    if (event.pointerType === 'mouse') return;
    longPressTriggered.current = false;
    longPressTimer.current = window.setTimeout(() => {
      longPressTriggered.current = true;
      onLongPress(product._id);
    }, 450);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const discountedPrice = discountPercent ? product.price * (1 - discountPercent / 100) : null;
  const discountButton = getDiscountButtonState(product.discountRules);

  return (
    <div
      className={cn(
        'bg-card rounded-lg border overflow-hidden hover:shadow-lg transition-shadow cursor-pointer flex flex-col h-full',
        product.sold && 'opacity-75 grayscale-[0.5]'
      )}
      onPointerDown={startLongPress}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onClick={() => {
        if (longPressTriggered.current) {
          longPressTriggered.current = false;
          return;
        }
        if (bulkSelectionEnabled) {
          if (selectionLocked) return;
          onToggleSelect(product._id);
          return;
        }
        onCardClick(product._id);
      }}
      {...(dataOnboardingId ? { 'data-onboarding-id': dataOnboardingId } : {})}
    >
      <div className="relative">
        <div className="aspect-video bg-muted overflow-hidden">
          <ImageWithFallback
            storageId={product.images[0]}
            src={product.imageSrc}
            alt={product.title}
            className="w-full h-full object-cover"
          />
        </div>
        {product.sold && (
          <div className="absolute inset-0 bg-black/10 flex items-center justify-center pointer-events-none">
            <div className="bg-background/90 backdrop-blur-sm px-4 py-1.5 rounded-full border shadow-lg transform -rotate-3">
              <span className="text-lg font-black tracking-tighter uppercase text-muted-foreground">
                Verkauft
              </span>
            </div>
          </div>
        )}
        {bulkSelectionEnabled && (
          <div className="absolute top-3 left-3" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelect(product._id)}
              className="bg-background"
              disabled={selectionLocked}
            />
          </div>
        )}
        <div className="absolute top-3 right-3 flex flex-col gap-1 items-end">
          {discountPercent && discountPercent > 0 && !product.sold && (
            <Badge variant="destructive">-{discountPercent}%</Badge>
          )}
          {product.moderation && (
            <Badge variant="destructive" title={product.moderation.reason}>
              {t('card.hiddenByModeration')}
            </Badge>
          )}
          {!!product.pendingOfferCount && (
            <Badge>{t('card.offers', { count: product.pendingOfferCount })}</Badge>
          )}
          {!!product.unansweredQuestionCount && (
            <Badge variant="secondary">
              {t('card.questions', { count: product.unansweredQuestionCount })}
            </Badge>
          )}
        </div>
      </div>

      <div className="p-4 flex flex-col flex-1">
        <h3 className="mb-2 line-clamp-1">{product.title}</h3>
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2 min-h-[40px]">
          {product.description}
        </p>

        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap min-h-[32px]">
          <div className="flex flex-col">
            {product.sale ? (
              <>
                {product.sale.totalAmount < product.sale.listPrice - 0.005 && (
                  <div className="text-sm text-muted-foreground">
                    <span className="line-through">{formatPriceDE(product.sale.listPrice)} €</span>{' '}
                    {priceSourceLabel(product.sale)}
                  </div>
                )}
                <div className="text-2xl font-bold">
                  {formatPriceDE(product.sale.totalAmount)} €
                </div>
                <div className="text-xs text-muted-foreground">
                  {t('card.payout', { amount: formatPriceDE(product.sale.payout) })}
                </div>
              </>
            ) : discountedPrice ? (
              <>
                <div className="text-sm text-muted-foreground line-through">
                  {formatPriceDE(product.price)} €
                </div>
                <div className="text-2xl font-bold text-destructive">
                  {formatPriceDE(discountedPrice)} €
                </div>
              </>
            ) : (
              <div className="text-2xl">{formatPriceDE(product.price)} €</div>
            )}
          </div>
          <Badge variant="outline" className="max-w-full truncate">
            {categoryLabel}
          </Badge>
        </div>

        <div
          className="flex flex-col sm:flex-wrap sm:flex-row gap-2 mt-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {product.sold ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:flex-1 gap-1"
                  disabled={!product.sale}
                >
                  <Download className="h-3.5 w-3.5" />
                  {t('card.privateInvoice')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onDownloadPrivateInvoice(product, 'buyer')}>
                  {t('card.forBuyer')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onDownloadPrivateInvoice(product, 'seller')}>
                  {t('card.forMe')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              {!product.isLocked && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:flex-1"
                  onClick={() => onEdit(product._id)}
                >
                  {t('card.edit')}
                </Button>
              )}
              {isOngoingEvent &&
                product.isAvailable &&
                onUpdateDiscount &&
                discountButton.visible && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full sm:flex-1 gap-1"
                    disabled={discountButton.disabled}
                    onClick={() => onUpdateDiscount(product._id)}
                  >
                    <Percent className="h-3.5 w-3.5" />
                    {discountButton.label}
                  </Button>
                )}
            </>
          )}
          {product.isLocked && product.canDelete && onDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="w-full sm:flex-1 gap-1">
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('card.delete')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t('card.deleteTitle', { title: product.title })}
                  </AlertDialogTitle>
                  <AlertDialogDescription>{t('card.deleteText')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('actions.cancel', { ns: 'common' })}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(product._id)}>
                    {t('card.delete')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {/* The label is only needed until the item is sold */}
          {!product.sold && (
            <Button
              size="sm"
              className="w-full sm:flex-1"
              onClick={() => onViewQR(product._id, product.title)}
              {...(qrOnboardingId ? { 'data-onboarding-id': qrOnboardingId } : {})}
            >
              {t('card.qrCode')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
