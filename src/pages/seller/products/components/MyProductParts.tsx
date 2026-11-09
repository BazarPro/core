import { useState } from 'react';
import {
  Copy,
  Download,
  EyeOff,
  HandCoins,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Percent,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Id } from '../../../../lib/api/types';
import { Button } from '../../../../components/ui/button';
import { ConfirmDialog } from '../../../../components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../../components/ui/dropdown-menu';
import { getDiscountButtonState } from '../../../../lib/discountRules';
import { cn, formatPriceDE } from '../../../../lib/utils';
import { STATUS_OPTIONS } from '../../../../constants/records';
import type { EventProductStatus } from '../../../../shared/constants';
import type { InvoiceCopy } from '../../../../lib/saleBreakdown';
import type { MyProductCardProduct } from './MyProductCard';

/** What a card or row of "My items" can do; missing callbacks hide their entry. */
export interface MyProductHandlers {
  onEdit: (id: Id<'products'>) => void;
  onDuplicate?: (id: Id<'products'>) => void;
  onDelete?: (id: Id<'products'>) => void;
  onDownloadPrivateInvoice: (product: MyProductCardProduct, copy: InvoiceCopy) => void;
  onViewQR: (id: Id<'products'>, title: string) => void;
  onCardClick: (id: Id<'products'>) => void;
  onUpdateDiscount?: (id: Id<'products'>) => void;
}

const STATUS_TONE: Record<EventProductStatus, string> = {
  announced: 'bg-sky-500',
  available: 'bg-emerald-500',
  sold: 'bg-muted-foreground',
  returned: 'bg-amber-500',
};

/** Small facts under the title: category, state at the bazaar, negotiation, open replies. */
export function MyProductFacts({
  product,
  categoryLabel,
  status,
  className,
}: {
  product: MyProductCardProduct;
  categoryLabel?: string;
  /** State at the bazaar shown: the filtered one or the one running now */
  status?: string;
  className?: string;
}) {
  const { t } = useTranslation('seller');
  const knownStatus = status && status in STATUS_TONE ? (status as EventProductStatus) : null;
  const unassigned = !product.sold && (product.eventIds?.length ?? 0) === 0;
  return (
    <div
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground',
        className
      )}
    >
      {product.attributes?.size && (
        <span className="whitespace-nowrap rounded bg-foreground/[0.06] px-1.5 py-px font-semibold text-foreground/80">
          {t('card.size', { size: product.attributes.size })}
        </span>
      )}
      {categoryLabel && <span className="truncate">{categoryLabel}</span>}
      {knownStatus && !product.sold && (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_TONE[knownStatus])} />
          {STATUS_OPTIONS[knownStatus].title}
        </span>
      )}
      {unassigned && (
        <span className="whitespace-nowrap rounded-full border border-dashed px-1.5 py-px">
          {t('card.noBazaar')}
        </span>
      )}
      {!product.sold && product.minimumPrice !== undefined && (
        <span
          className="whitespace-nowrap rounded-full bg-muted px-1.5 py-px font-medium text-foreground/80"
          title={t('card.minimumHint')}
        >
          {t('card.minimum', { price: formatPriceDE(product.minimumPrice) })}
        </span>
      )}
      {!product.sold && product.acceptsOffers && (
        <span
          className="inline-flex items-center gap-1 whitespace-nowrap"
          title={t('form.acceptsOffers')}
        >
          <HandCoins className="h-3 w-3" />
          {t('card.acceptsOffers')}
        </span>
      )}
    </div>
  );
}

/** Things that wait for the seller or keep the item hidden; strongest first. */
export function MyProductAlerts({
  product,
  className,
}: {
  product: MyProductCardProduct;
  className?: string;
}) {
  const { t } = useTranslation('seller');
  if (!product.moderation && !product.pendingOfferCount && !product.unansweredQuestionCount) {
    return null;
  }
  const chip = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium';
  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {product.moderation && (
        <span className={cn(chip, 'bg-destructive text-white')} title={product.moderation.reason}>
          <EyeOff className="h-3 w-3" />
          {t('card.hiddenByModeration')}
        </span>
      )}
      {!!product.pendingOfferCount && (
        <span className={cn(chip, 'bg-primary text-primary-foreground')}>
          <HandCoins className="h-3 w-3" />
          {t('card.offers', { count: product.pendingOfferCount })}
        </span>
      )}
      {!!product.unansweredQuestionCount && (
        <span
          className={cn(chip, 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100')}
        >
          <MessageCircle className="h-3 w-3" />
          {t('card.questions', { count: product.unansweredQuestionCount })}
        </span>
      )}
    </div>
  );
}

/** The "…" menu of an item with everything besides the QR code. */
export function MyProductMenu({
  product,
  handlers,
  canDiscount,
  className,
}: {
  product: MyProductCardProduct;
  handlers: MyProductHandlers;
  /** A bazaar of the item runs and allows discounts */
  canDiscount: boolean;
  className?: string;
}) {
  const { t } = useTranslation('seller');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const discountButton = getDiscountButtonState(product.discountRules);
  const deletable = !!handlers.onDelete && (product.canDelete ?? !product.isLocked);
  const editable = !product.sold && !product.isLocked;
  const showDiscount =
    !product.sold &&
    canDiscount &&
    product.isAvailable &&
    !!handlers.onUpdateDiscount &&
    discountButton.visible;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn('size-8 shrink-0 text-muted-foreground', className)}
            aria-label={t('card.more', { title: product.title })}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {editable && (
            <DropdownMenuItem onSelect={() => handlers.onEdit(product._id)}>
              <Pencil className="h-4 w-4" />
              {t('card.edit')}
            </DropdownMenuItem>
          )}
          {handlers.onDuplicate && (
            <DropdownMenuItem onSelect={() => handlers.onDuplicate?.(product._id)}>
              <Copy className="h-4 w-4" />
              {t('card.duplicate')}
            </DropdownMenuItem>
          )}
          {showDiscount && (
            <DropdownMenuItem
              disabled={discountButton.disabled}
              onSelect={() => handlers.onUpdateDiscount?.(product._id)}
            >
              <Percent className="h-4 w-4" />
              {discountButton.label}
            </DropdownMenuItem>
          )}
          {product.sold && product.sale && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {t('card.privateInvoice')}
              </DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={() => handlers.onDownloadPrivateInvoice(product, 'buyer')}
              >
                <Download className="h-4 w-4" />
                {t('card.forBuyer')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => handlers.onDownloadPrivateInvoice(product, 'seller')}
              >
                <Download className="h-4 w-4" />
                {t('card.forMe')}
              </DropdownMenuItem>
            </>
          )}
          {deletable && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
                {t('card.delete')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {deletable && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={t('card.deleteTitle', { title: product.title })}
          description={t('card.deleteText')}
          confirmLabel={t('card.delete')}
          onConfirm={() => handlers.onDelete?.(product._id)}
          destructive
        />
      )}
    </>
  );
}
