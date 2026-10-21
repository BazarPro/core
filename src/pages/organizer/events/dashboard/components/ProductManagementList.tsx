import {
  CheckCircle2,
  Download,
  RotateCcw,
  ShoppingCart,
  Undo2,
  UserCircle,
  Image as ImageIcon,
  DollarSign,
  StickyNote,
  Pencil,
  Trash2,
  type LucideProps,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { Badge } from '../../../../../components/ui/badge';
import { Button } from '../../../../../components/ui/button';
import { ConvexImage } from '../../../../../components/ui/ConvexImage';
import type { Id } from '../../../../../../convex/_generated/dataModel';
import { discountedPrice } from '../../../../../../convex/eventFeatures';
import type { InventoryActionType } from '../../../../../hooks/useInventoryActions';
import type { ProductWithStatus } from './inventoryTypes';
import { cn, formatPriceDE } from '../../../../../lib/utils';
import { getEventProductStatusTitle } from '../../../../../lib/eventProductStatus';
import { priceSourceLabel } from '../../../../../lib/saleBreakdown';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../../../components/ui/tabs';
import { Pagination } from '../../../../../components/ui/pagination';
import { WalkInBadge } from '../../../../../components/walkIn/WalkInBadge';
import { useTranslation } from 'react-i18next';

export type ProductManagementTab = 'all' | 'announced' | 'available' | 'sold' | 'returned';

interface ProductManagementListProps {
  products: ProductWithStatus[];
  resolveVendorName: (vendorId: Id<'users'>) => string;
  isWalkInVendor: (vendorId: Id<'users'>) => boolean;
  /** Paid-out sellers are settled: their items can no longer be sold, returned or undone */
  isVendorPaid: (vendorId: Id<'users'>) => boolean;
  isSubmitting: boolean;
  isUndoInventoryActionsEnabled: boolean;
  activeTab: ProductManagementTab;
  onTabChange: (tab: ProductManagementTab) => void;
  onTriggerConfirm: (
    type: InventoryActionType,
    eventProductId: Id<'eventProducts'>,
    productTitle: string,
    price: number,
    discountPercent?: number
  ) => void;
  onDownloadPrivateInvoice: (product: ProductWithStatus) => void;
  onNavigateToProduct: (productId: Id<'products'>) => void;
  onSelectVendor: (vendorId: Id<'users'>) => void;
  /** Items of walk-in sellers: the organizer edits and deletes them for the seller */
  onEditWalkInProduct: (product: ProductWithStatus) => void;
  onDeleteWalkInProduct: (product: ProductWithStatus) => void;
  /** Changes with the search, so the list starts on page 1 again */
  filterKey: string;
}

const ITEMS_PER_PAGE = 30;

const TABS: {
  value: ProductManagementTab;
  icon: React.ComponentType<LucideProps>;
}[] = [
  { value: 'all', icon: ImageIcon },
  { value: 'announced', icon: CheckCircle2 },
  { value: 'available', icon: ShoppingCart },
  { value: 'sold', icon: DollarSign },
  { value: 'returned', icon: RotateCcw },
];

const STATUS_BADGE: Record<string, string> = {
  announced: 'border-transparent bg-muted text-muted-foreground',
  available: 'border-transparent bg-primary/10 text-primary',
  sold: 'border-transparent bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  returned:
    'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
};

/** Compact rows: small fixed thumbnail, item and seller, status, price and the next action. */
export function ProductManagementList({
  products,
  resolveVendorName,
  isWalkInVendor,
  isVendorPaid,
  isSubmitting,
  isUndoInventoryActionsEnabled,
  activeTab,
  onTabChange,
  onTriggerConfirm,
  onDownloadPrivateInvoice,
  onNavigateToProduct,
  onSelectVendor,
  onEditWalkInProduct,
  onDeleteWalkInProduct,
  filterKey,
}: ProductManagementListProps) {
  const { t } = useTranslation('organizer');
  const [currentPage, setCurrentPage] = useState(1);

  // Reset pagination when the tab or the search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, filterKey]);

  const countFor = (tab: ProductManagementTab) =>
    tab === 'all' ? products.length : products.filter((p) => p.status === tab).length;

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => onTabChange(v as ProductManagementTab)}
      className="w-full"
    >
      <TabsList
        className="grid w-full grid-cols-3 md:w-auto md:grid-cols-5 h-auto p-1 bg-muted mb-4"
        id="product-list-top"
      >
        {TABS.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className="py-2 px-1 text-xs sm:text-sm gap-1.5"
          >
            <tab.icon className="h-4 w-4 hidden sm:block" />
            {t(`list.${tab.value}`)}
            <span className="text-muted-foreground tabular-nums">{countFor(tab.value)}</span>
          </TabsTrigger>
        ))}
      </TabsList>

      {TABS.map((tab) => {
        const filtered = products.filter((p) => tab.value === 'all' || p.status === tab.value);
        const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
        const paginated = filtered.slice(
          (currentPage - 1) * ITEMS_PER_PAGE,
          currentPage * ITEMS_PER_PAGE
        );

        return (
          <TabsContent key={tab.value} value={tab.value} className="mt-0 space-y-4">
            {filtered.length === 0 ? (
              <div className="py-12 text-center bg-muted/20 rounded-xl border-2 border-dashed">
                <p className="text-muted-foreground">{t('list.empty')}</p>
              </div>
            ) : (
              <ul className="divide-y rounded-xl border bg-card shadow-sm">
                {paginated.map((product) => (
                  <ProductRow
                    key={product._id}
                    product={product}
                    vendorName={resolveVendorName(product.vendorId)}
                    isWalkInVendor={isWalkInVendor(product.vendorId)}
                    isVendorPaid={isVendorPaid(product.vendorId)}
                    isSubmitting={isSubmitting}
                    isUndoInventoryActionsEnabled={isUndoInventoryActionsEnabled}
                    onTriggerConfirm={onTriggerConfirm}
                    onDownloadPrivateInvoice={onDownloadPrivateInvoice}
                    onNavigateToProduct={onNavigateToProduct}
                    onSelectVendor={onSelectVendor}
                    onEditWalkInProduct={onEditWalkInProduct}
                    onDeleteWalkInProduct={onDeleteWalkInProduct}
                  />
                ))}
              </ul>
            )}

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              scrollRefId="product-list-top"
            />
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

function ProductRow({
  product,
  vendorName,
  isWalkInVendor,
  isVendorPaid,
  isSubmitting,
  isUndoInventoryActionsEnabled,
  onTriggerConfirm,
  onDownloadPrivateInvoice,
  onNavigateToProduct,
  onSelectVendor,
  onEditWalkInProduct,
  onDeleteWalkInProduct,
}: {
  product: ProductWithStatus;
  vendorName: string;
  isWalkInVendor: boolean;
  isVendorPaid: boolean;
  isSubmitting: boolean;
  isUndoInventoryActionsEnabled: boolean;
  onTriggerConfirm: ProductManagementListProps['onTriggerConfirm'];
  onDownloadPrivateInvoice: (product: ProductWithStatus) => void;
  onNavigateToProduct: (productId: Id<'products'>) => void;
  onSelectVendor: (vendorId: Id<'users'>) => void;
  onEditWalkInProduct: (product: ProductWithStatus) => void;
  onDeleteWalkInProduct: (product: ProductWithStatus) => void;
}) {
  const { t } = useTranslation('organizer');
  // Sellers without account cannot fix their items themselves
  const canChangeForSeller =
    isWalkInVendor &&
    !isVendorPaid &&
    (product.status === 'announced' || product.status === 'available');
  const trigger = (type: InventoryActionType) =>
    onTriggerConfirm(
      type,
      product.eventProductId,
      product.title,
      product.price,
      product.discountPercent
    );

  return (
    <li className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          type="button"
          onClick={() => onNavigateToProduct(product._id)}
          className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted"
          aria-label={t('list.open', { title: product.title })}
        >
          {product.images?.[0] ? (
            <ConvexImage
              storageId={product.images[0]}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <ImageIcon className="m-auto h-6 w-6 text-muted-foreground/40" />
          )}
        </button>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigateToProduct(product._id)}
              className="truncate text-left font-semibold hover:underline"
            >
              {product.title}
            </button>
            <Badge variant="outline" className={cn('shrink-0', STATUS_BADGE[product.status])}>
              {getEventProductStatusTitle(product.status)}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() => onSelectVendor(product.vendorId)}
              className="flex items-center gap-1 hover:text-primary hover:underline"
            >
              <UserCircle className="h-3 w-3" />
              {vendorName}
            </button>
            {isWalkInVendor && <WalkInBadge className="px-1.5 py-0 text-[10px]" />}
            {canChangeForSeller && (
              <>
                <button
                  type="button"
                  onClick={() => onEditWalkInProduct(product)}
                  className="flex items-center gap-1 hover:text-primary hover:underline"
                >
                  <Pencil className="h-3 w-3" /> {t('list.edit')}
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteWalkInProduct(product)}
                  className="flex items-center gap-1 hover:text-destructive hover:underline"
                >
                  <Trash2 className="h-3 w-3" /> {t('list.delete')}
                </button>
              </>
            )}
            {product.internalNote && (
              <span className="flex min-w-0 items-center gap-1 text-amber-700 dark:text-amber-300">
                <StickyNote className="h-3 w-3 shrink-0" />
                <span className="truncate">{product.internalNote}</span>
              </span>
            )}
            {product.moderation && (
              <span className="text-destructive" title={product.moderation.reason}>
                {t('list.hidden')}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <div className="text-right tabular-nums">
          {product.sale ? (
            <>
              <div className="font-bold">{formatPriceDE(product.sale.totalAmount)} €</div>
              {product.sale.totalAmount < product.sale.listPrice - 0.005 && (
                <div className="text-xs text-muted-foreground">
                  <span className="line-through">{formatPriceDE(product.sale.listPrice)} €</span>{' '}
                  {priceSourceLabel(product.sale)}
                </div>
              )}
            </>
          ) : product.discountPercent ? (
            <>
              <div className="font-bold text-destructive">
                {formatPriceDE(discountedPrice(product.price, product.discountPercent))} €
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="line-through">{formatPriceDE(product.price)} €</span> −
                {product.discountPercent}%
              </div>
            </>
          ) : (
            <div className="font-bold">{formatPriceDE(product.price)} €</div>
          )}
        </div>

        <div className="flex w-44 shrink-0 justify-end gap-2">
          {isVendorPaid && product.status !== 'sold' && (
            <span className="self-center text-xs text-muted-foreground">{t('list.settled')}</span>
          )}

          {product.status === 'announced' && !isVendorPaid && (
            <Button
              className="flex-1 gap-2"
              onClick={() => trigger('markAvailable')}
              disabled={isSubmitting}
            >
              <CheckCircle2 className="h-4 w-4" /> {t('list.accept')}
            </Button>
          )}

          {product.status === 'available' && !isVendorPaid && (
            <>
              <Button
                className="flex-1 gap-2 bg-green-600 hover:bg-green-700"
                onClick={() => trigger('sell')}
                disabled={isSubmitting}
              >
                <ShoppingCart className="h-4 w-4" /> {t('list.sell')}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => trigger('return')}
                disabled={isSubmitting}
                title={t('list.return')}
                aria-label={t('list.return')}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </>
          )}

          {product.status === 'sold' && (
            <>
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => onDownloadPrivateInvoice(product)}
              >
                <Download className="h-4 w-4" /> {t('list.receipt')}
              </Button>
              {isUndoInventoryActionsEnabled && !isVendorPaid && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => trigger('undoSale')}
                  title={t('list.cancelSale')}
                  aria-label={t('list.cancelSale')}
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
              )}
            </>
          )}

          {product.status === 'returned' && isUndoInventoryActionsEnabled && !isVendorPaid && (
            <Button variant="ghost" className="flex-1 gap-2" onClick={() => trigger('undoReturn')}>
              <Undo2 className="h-4 w-4" /> {t('list.undo')}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
