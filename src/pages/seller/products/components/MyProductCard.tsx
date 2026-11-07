import type { Id } from '../../../../lib/api/types';
import { useRef, type PointerEvent, type ReactNode } from 'react';
import { Download, Percent, QrCode } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../../components/ui/dropdown-menu';
import { getDiscountButtonState } from '../../../../lib/discountRules';
import { Button } from '../../../../components/ui/button';
import { Checkbox } from '../../../../components/ui/checkbox';
import { cn } from '../../../../lib/utils';
import type { DiscountRules } from '../../../../lib/api/types';
import type { SaleInfo } from '../../../../lib/api/types';
import { ProductMedia } from '../../../../components/products/ProductMedia';
import { ProductPrice } from '../../../../components/products/ProductPrice';
import { useTranslation } from 'react-i18next';
import {
  MyProductAlerts,
  MyProductFacts,
  MyProductMenu,
  type MyProductHandlers,
} from './MyProductParts';

/**
 * One item of "My items", as a card of the grid or a row of the list: photo or
 * placeholder, title, facts, price in its current state, QR code and a menu.
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
  /** Discount at the bazaar running now */
  discountPercent?: number;
  /** State at the bazaar running now */
  eventStatus?: string;
  discountRules?: DiscountRules;
  acceptsOffers?: boolean;
  minimumPrice?: number;
  /** Category fields, e.g. the size shown with the title */
  attributes?: Record<string, string>;
  pendingOfferCount?: number;
  unansweredQuestionCount?: number;
  moderation?: { reason: string };
  /** Sold items: what the buyer paid, the fee and the payout. */
  sale?: SaleInfo;
}

export type MyProductLayout = 'grid' | 'list';

interface MyProductCardProps extends MyProductHandlers {
  product: MyProductCardProduct;
  layout?: MyProductLayout;
  categoryLabel: string | undefined;
  isSelected: boolean;
  onToggleSelect: (id: Id<'products'>) => void;
  /** Discount at the filtered bazaar; the running one otherwise */
  discountPercent?: number;
  /** State at the filtered bazaar; the running one otherwise */
  status?: string;
  /** A bazaar of the item runs, so discounts can be set */
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
  layout = 'grid',
  categoryLabel,
  isSelected,
  onToggleSelect,
  discountPercent,
  status,
  isOngoingEvent = false,
  bulkSelectionEnabled = false,
  selectionLocked = false,
  onLongPress,
  dataOnboardingId,
  qrOnboardingId,
  ...handlers
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

  const onClick = () => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    if (bulkSelectionEnabled) {
      if (selectionLocked) return;
      onToggleSelect(product._id);
      return;
    }
    handlers.onCardClick(product._id);
  };

  const price = {
    price: product.price,
    discountPercent: discountPercent ?? product.discountPercent,
    sold: product.sold,
    sale: product.sale,
  };

  const checkbox = bulkSelectionEnabled && (
    <div onClick={(e) => e.stopPropagation()} className="flex">
      <Checkbox
        checked={isSelected}
        onCheckedChange={() => onToggleSelect(product._id)}
        className="bg-background"
        disabled={selectionLocked}
        aria-label={product.title}
      />
    </div>
  );

  // The label is only needed until the item is sold
  const qrButton = (compact: boolean) =>
    !product.sold && (
      <Button
        variant="soft"
        size="sm"
        className={cn(compact ? 'size-8 p-0' : 'flex-1')}
        onClick={(e) => {
          e.stopPropagation();
          handlers.onViewQR(product._id, product.title);
        }}
        aria-label={t('card.qrCode')}
        title={t('card.qrCode')}
        {...(qrOnboardingId ? { 'data-onboarding-id': qrOnboardingId } : {})}
      >
        <QrCode className="h-4 w-4" />
        {!compact && t('card.qrCode')}
      </Button>
    );

  const discountState = getDiscountButtonState(product.discountRules);
  const discount = {
    ...discountState,
    visible:
      !product.sold &&
      isOngoingEvent &&
      !!product.isAvailable &&
      !!handlers.onUpdateDiscount &&
      discountState.visible,
  };

  const menu = <MyProductMenu product={product} handlers={handlers} canDiscount={isOngoingEvent} />;

  const shell = (className: string, children: ReactNode) => (
    <div
      className={cn(
        'group bg-card border shadow-xs transition-[box-shadow,border-color] cursor-pointer hover:shadow-md',
        isSelected && 'border-primary ring-2 ring-primary/30',
        className
      )}
      onPointerDown={startLongPress}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onClick={onClick}
      {...(dataOnboardingId ? { 'data-onboarding-id': dataOnboardingId } : {})}
    >
      {children}
    </div>
  );

  if (layout === 'list') {
    return shell(
      'flex items-center gap-3 rounded-lg p-2 pr-2 sm:gap-4 sm:p-2.5',
      <>
        {checkbox}
        <div className="relative shrink-0">
          <ProductMedia
            title={product.title}
            images={product.images}
            imageSrc={product.imageSrc}
            size="sm"
            dimmed={product.sold}
            className="h-14 w-14 rounded-md sm:h-16 sm:w-16"
          />
          {product.sold && <SoldStamp small />}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold sm:text-base">{product.title}</h3>
          </div>
          <MyProductFacts product={product} categoryLabel={categoryLabel} status={status} />
          {/* Phones: the price goes under the title, which keeps the room it needs */}
          <ProductPrice item={price} size="sm" showPayout={false} className="sm:hidden" />
          <MyProductAlerts product={product} />
        </div>
        <ProductPrice item={price} size="sm" align="end" className="hidden shrink-0 sm:flex" />
        <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {/* Sold: no label any more; the gap keeps the prices in one column */}
          {qrButton(true) || <span className="size-8" aria-hidden />}
          {menu}
        </div>
      </>
    );
  }

  return shell(
    'flex h-full flex-col overflow-hidden rounded-xl',
    <>
      <div className="relative">
        <ProductMedia
          title={product.title}
          images={product.images}
          imageSrc={product.imageSrc}
          dimmed={product.sold}
          className="aspect-[16/10]"
        />
        {product.sold && <SoldStamp />}
        {checkbox && <div className="absolute left-3 top-3">{checkbox}</div>}
        <MyProductAlerts
          product={product}
          className="absolute right-3 top-3 max-w-[70%] flex-col items-end"
        />
        {!product.sold && !!price.discountPercent && (
          <span className="absolute bottom-3 left-3 rounded-full bg-destructive px-2.5 py-0.5 text-xs font-semibold text-white shadow">
            −{price.discountPercent} %
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="space-y-1">
          <h3 className="line-clamp-1 text-base font-semibold">{product.title}</h3>
          <MyProductFacts product={product} categoryLabel={categoryLabel} status={status} />
        </div>
        {product.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{product.description}</p>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <ProductPrice item={price} showPercent={false} />
        </div>

        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {qrButton(false)}
          {!product.sold && !product.isLocked ? (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => handlers.onEdit(product._id)}
            >
              {t('card.edit')}
            </Button>
          ) : discount.visible ? (
            // Handed in: no editing any more, but the price can still go down
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={discount.disabled}
              onClick={() => handlers.onUpdateDiscount?.(product._id)}
            >
              <Percent className="h-4 w-4" />
              {discount.label}
            </Button>
          ) : product.sold && product.sale ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="flex-1">
                  <Download className="h-4 w-4" />
                  {t('card.privateInvoice')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onSelect={() => handlers.onDownloadPrivateInvoice(product, 'buyer')}
                >
                  {t('card.forBuyer')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => handlers.onDownloadPrivateInvoice(product, 'seller')}
                >
                  {t('card.forMe')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex-1" />
          )}
          {menu}
        </div>
      </div>
    </>
  );
}

function SoldStamp({ small = false }: { small?: boolean }) {
  const { t } = useTranslation('seller');
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10">
      <span
        className={cn(
          'rounded-full border bg-background/90 font-semibold uppercase tracking-wide text-muted-foreground shadow-lg backdrop-blur-sm',
          small ? 'px-1.5 py-px text-[0.6rem]' : '-rotate-3 px-4 py-1.5 text-sm'
        )}
      >
        {t('card.sold')}
      </span>
    </div>
  );
}
