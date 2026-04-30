import {
  CheckCircle2,
  Download,
  QrCode,
  RotateCcw,
  Search,
  ShoppingCart,
  Undo2,
} from 'lucide-react';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../../../components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../../components/ui/table';
import { Badge } from '../../../../../components/ui/badge';
import { Button } from '../../../../../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../../components/ui/select';
import type { Doc, Id } from '../../../../../../convex/_generated/dataModel';
import type { InventoryActionType } from '../../../../../hooks/useInventoryActions';
import type { ProductWithStatus } from './inventoryTypes';
import { formatPriceDE } from '../../../../../lib/utils';
import { STATUS_OPTIONS } from '../../../../../constants/records';
import { getEventProductStatusTitle } from '../../../../../lib/eventProductStatus';

export type InventoryTabType = 'all' | 'announced' | 'available' | 'sold' | 'returned';

interface InventoryProductsTableProps {
  products: ProductWithStatus[];
  locationCategories: Doc<'eventLocationCategories'>[] | undefined;
  resolveVendorName: (vendorId: Id<'users'>) => string;
  isSubmitting: boolean;
  isUndoInventoryActionsEnabled: boolean;
  onNavigateToProduct: (productId: Id<'products'>) => void;
  onTriggerConfirm: (
    type: InventoryActionType,
    eventProductId: Id<'eventProducts'>,
    productTitle: string,
    price: number,
    discountPercent?: number
  ) => void;
  onDownloadPrivateInvoice: (product: ProductWithStatus) => void;
  onLocationCategoryChange: (
    eventProductId: Id<'eventProducts'>,
    locationCategoryId: Id<'eventLocationCategories'> | undefined
  ) => Promise<void>;
  activeTab?: InventoryTabType;
  onTabChange?: (tab: InventoryTabType) => void;
  hideTabs?: boolean;
}

const tabs = ['all', 'announced', 'available', 'sold', 'returned'] as const;

/** Same radius as cards/header (`rounded-lg`); overrides `rounded-xl` from ui/tabs. */
const tabTriggerClass = 'rounded-lg flex-1 min-w-[calc(50%-6px)] sm:min-w-0 py-2.5 sm:py-1.5 px-4';

function getStatusVariant(status: string): 'default' | 'secondary' | 'outline' {
  if (status === 'available') return 'default';
  if (status === 'sold') return 'secondary';
  return 'outline';
}

export function InventoryProductsTable({
  products,
  locationCategories,
  resolveVendorName,
  isSubmitting,
  isUndoInventoryActionsEnabled,
  onNavigateToProduct,
  onTriggerConfirm,
  onDownloadPrivateInvoice,
  onLocationCategoryChange,
  activeTab = 'all',
  onTabChange,
  hideTabs = false,
}: InventoryProductsTableProps) {
  const [locationSavingId, setLocationSavingId] = useState<Id<'eventProducts'> | null>(null);

  const handleLocationSelect = async (eventProductId: Id<'eventProducts'>, value: string) => {
    setLocationSavingId(eventProductId);
    try {
      await onLocationCategoryChange(
        eventProductId,
        value === 'none' ? undefined : (value as Id<'eventLocationCategories'>)
      );
    } finally {
      setLocationSavingId(null);
    }
  };

  const currentTab = hideTabs ? 'all' : activeTab;

  return (
    <Tabs
      value={currentTab}
      onValueChange={(val) => onTabChange?.(val as InventoryTabType)}
      className="w-full"
    >
      {!hideTabs && (
        <TabsList className="flex flex-wrap h-auto w-full rounded-lg p-1 gap-1.5 mb-6 bg-muted">
          <TabsTrigger value="all" className={tabTriggerClass}>
            <Search className="h-4 w-4" />
            Alle
          </TabsTrigger>
          <TabsTrigger value="announced" className={tabTriggerClass}>
            <QrCode className="h-4 w-4" />
            {STATUS_OPTIONS.announced.title}
          </TabsTrigger>
          <TabsTrigger value="available" className={tabTriggerClass}>
            <CheckCircle2 className="h-4 w-4" />
            {STATUS_OPTIONS.available.title}
          </TabsTrigger>
          <TabsTrigger value="sold" className={tabTriggerClass}>
            <ShoppingCart className="h-4 w-4" />
            {STATUS_OPTIONS.sold.title}
          </TabsTrigger>
          <TabsTrigger
            value="returned"
            className={`${tabTriggerClass} min-w-[calc(100%-12px)] sm:min-w-0`}
          >
            <RotateCcw className="h-4 w-4" />
            {STATUS_OPTIONS.returned.title}
          </TabsTrigger>
        </TabsList>
      )}

      {tabs.map((tab) => {
        if (hideTabs && tab !== 'all') return null;

        const tabProducts = products.filter((p) => tab === 'all' || p.status === tab);
        return (
          <TabsContent key={tab} value={tab}>
            <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-0 w-[28%]">Produkt</TableHead>
                    <TableHead className="min-w-0 w-[18%]">Verkäufer</TableHead>
                    <TableHead className="w-24 shrink-0">Preis</TableHead>
                    <TableHead className="w-48 min-w-48 max-w-48 shrink-0">Standort</TableHead>
                    <TableHead className="w-36 shrink-0">Status</TableHead>
                    <TableHead className="w-80 min-w-80 shrink-0 text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tabProducts.map((product) => (
                    <TableRow
                      key={product._id}
                      className="group cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => onNavigateToProduct(product._id)}
                    >
                      <TableCell className="font-medium min-w-0 align-middle">
                        <div className="break-words">{product.title}</div>
                        <div className="text-[10px] text-muted-foreground font-mono uppercase">
                          {product._id}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground min-w-0 align-middle break-words">
                        {resolveVendorName(product.vendorId)}
                      </TableCell>
                      <TableCell className="font-semibold align-middle">
                        <div className="flex flex-col">
                          {product.discountPercent ? (
                            <>
                              <span className="text-xs text-muted-foreground line-through">
                                {formatPriceDE(product.price)} €
                              </span>
                              <span className="text-destructive">
                                {formatPriceDE(product.price * (1 - product.discountPercent / 100))} €
                              </span>
                            </>
                          ) : (
                            <span>{formatPriceDE(product.price)} €</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell
                        className="w-48 min-w-48 max-w-48 overflow-hidden align-middle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {locationCategories === undefined ? (
                          <span className="text-muted-foreground text-sm block h-8 leading-8">
                            …
                          </span>
                        ) : (
                          <Select
                            value={product.locationCategoryId ?? 'none'}
                            onValueChange={(v) => void handleLocationSelect(product.eventProductId, v)}
                            disabled={isSubmitting || locationSavingId === product.eventProductId}
                          >
                            <SelectTrigger
                              size="sm"
                              className="w-full min-w-0 max-w-full [&_[data-slot=select-value]]:truncate"
                            >
                              <SelectValue placeholder="Standort" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Keine Zuordnung</SelectItem>
                              {locationCategories.map((c) => (
                                <SelectItem key={c._id} value={c._id}>
                                  {c.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell className="align-middle">
                        <Badge variant={getStatusVariant(product.status)}>
                          {getEventProductStatusTitle(product.status)}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className="w-80 min-w-80 text-right align-middle whitespace-normal"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex flex-wrap justify-end gap-2 content-start">
                          {product.status === 'announced' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1"
                              onClick={() =>
                                onTriggerConfirm(
                                  'markAvailable',
                                  product.eventProductId,
                                  product.title,
                                  product.price,
                                  product.discountPercent
                                )
                              }
                              disabled={isSubmitting}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Annehmen
                            </Button>
                          )}
                          {product.status === 'available' && (
                            <>
                              <Button
                                size="sm"
                                className="h-8 gap-1 bg-green-600 hover:bg-green-700"
                                onClick={() =>
                                  onTriggerConfirm(
                                    'sell',
                                    product.eventProductId,
                                    product.title,
                                    product.price,
                                    product.discountPercent
                                  )
                                }
                                disabled={isSubmitting}
                              >
                                <ShoppingCart className="h-3.5 w-3.5" />
                                Verkaufen
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1"
                                onClick={() =>
                                  onTriggerConfirm(
                                    'return',
                                    product.eventProductId,
                                    product.title,
                                    product.price,
                                    product.discountPercent
                                  )
                                }
                                disabled={isSubmitting}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Zurückgeben
                              </Button>
                            </>
                          )}
                          {isUndoInventoryActionsEnabled && product.status === 'sold' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 gap-1 text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                onTriggerConfirm(
                                  'undoSale',
                                  product.eventProductId,
                                  product.title,
                                  product.price,
                                  product.discountPercent
                                )
                              }
                              disabled={isSubmitting}
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                              Storno
                            </Button>
                          )}

                          {product.status === 'sold' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDownloadPrivateInvoice(product);
                              }}
                              disabled={isSubmitting}
                            >
                              <Download className="h-3.5 w-3.5" />
                              Privatrechnung
                            </Button>
                          )}

                          {isUndoInventoryActionsEnabled && product.status === 'returned' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 gap-1 text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                onTriggerConfirm(
                                  'undoReturn',
                                  product.eventProductId,
                                  product.title,
                                  product.price,
                                  product.discountPercent
                                )
                              }
                              disabled={isSubmitting}
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                              Rückgängig
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {tabProducts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                        Keine Produkte in dieser Kategorie gefunden.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
