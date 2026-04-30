import {
  CheckCircle2,
  Download,
  RotateCcw,
  ShoppingCart,
  Undo2,
  UserCircle,
  Image as ImageIcon,
  DollarSign,
  type LucideProps,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { Badge } from '../../../../../components/ui/badge';
import { Button } from '../../../../../components/ui/button';
import { ConvexImage } from '../../../../../components/ui/ConvexImage';
import type { Id } from '../../../../../../convex/_generated/dataModel';
import type { InventoryActionType } from '../../../../../hooks/useInventoryActions';
import type { ProductWithStatus } from './inventoryTypes';
import { formatPriceDE } from '../../../../../lib/utils';
import { getEventProductStatusTitle } from '../../../../../lib/eventProductStatus';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../../../components/ui/tabs';
import { Pagination } from '../../../../../components/ui/pagination';

export type ProductManagementTab = 'all' | 'announced' | 'available' | 'sold' | 'returned';

interface ProductManagementListProps {
  products: ProductWithStatus[];
  resolveVendorName: (vendorId: Id<'users'>) => string;
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
}

const ITEMS_PER_PAGE = 24;

export function ProductManagementList({
  products,
  resolveVendorName,
  isSubmitting,
  isUndoInventoryActionsEnabled,
  activeTab,
  onTabChange,
  onTriggerConfirm,
  onDownloadPrivateInvoice,
  onNavigateToProduct,
  onSelectVendor,
}: ProductManagementListProps) {
  const [currentPage, setCurrentPage] = useState(1);

  // Reset pagination when tab or products change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  const tabs: {
    value: ProductManagementTab;
    label: string;
    icon: React.ComponentType<LucideProps>;
  }[] = [
    { value: 'all', label: 'Alle', icon: ImageIcon },
    { value: 'announced', label: 'Annahme', icon: CheckCircle2 },
    { value: 'available', label: 'Verkauf', icon: ShoppingCart },
    { value: 'sold', label: 'Verkauft', icon: DollarSign },
    { value: 'returned', label: 'Rückgabe', icon: RotateCcw },
  ];

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => onTabChange(v as ProductManagementTab)}
      className="w-full"
    >
      <TabsList
        className="grid grid-cols-3 md:grid-cols-5 h-auto p-1 bg-muted mb-6"
        id="product-list-top"
      >
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className="py-2 px-1 text-xs sm:text-sm gap-2"
          >
            <tab.icon className="h-4 w-4 hidden sm:block" />
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {tabs.map((tab) => {
        const filtered = products.filter((p) => tab.value === 'all' || p.status === tab.value);
        const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
        const paginated = filtered.slice(
          (currentPage - 1) * ITEMS_PER_PAGE,
          currentPage * ITEMS_PER_PAGE
        );

        return (
          <TabsContent key={tab.value} value={tab.value} className="mt-0 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {paginated.map((product) => (
                <div
                  key={product._id}
                  className="bg-card border rounded-xl overflow-hidden shadow-sm flex flex-col hover:shadow-md transition-shadow"
                >
                  {/* Image & Status Badge */}
                  <div
                    className="relative aspect-video bg-muted group cursor-pointer"
                    onClick={() => onNavigateToProduct(product._id)}
                  >
                    {product.images?.[0] ? (
                      <ConvexImage
                        storageId={product.images[0]}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                        <ImageIcon className="h-12 w-12" />
                      </div>
                    )}
                    <div className="absolute top-2 right-2">
                      <Badge
                        variant={product.status === 'available' ? 'default' : 'secondary'}
                        className="shadow-sm"
                      >
                        {getEventProductStatusTitle(product.status)}
                      </Badge>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="mb-3">
                      <h3 className="font-bold leading-tight line-clamp-1 mb-1">{product.title}</h3>
                      <button
                        onClick={() => onSelectVendor(product.vendorId)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer group/vendor"
                      >
                        <UserCircle className="h-3 w-3 group-hover/vendor:text-primary" />
                        <span className="truncate group-hover/vendor:underline">
                          {resolveVendorName(product.vendorId)}
                        </span>
                      </button>
                    </div>

                    <div className="mt-auto space-y-4">
                      {/* Price Block */}
                      <div className="flex items-baseline justify-between">
                        <div className="flex flex-col">
                          {product.discountPercent ? (
                            <>
                              <span className="text-[10px] text-muted-foreground line-through decoration-destructive/50">
                                {formatPriceDE(product.price)} €
                              </span>
                              <span className="text-lg font-black text-destructive">
                                {formatPriceDE(product.price * (1 - product.discountPercent / 100))}{' '}
                                €
                              </span>
                            </>
                          ) : (
                            <span className="text-lg font-bold">
                              {formatPriceDE(product.price)} €
                            </span>
                          )}
                        </div>
                        {product.discountPercent && (
                          <Badge variant="destructive" className="text-[10px] h-5 px-1.5">
                            -{product.discountPercent}%
                          </Badge>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="grid grid-cols-1 gap-2">
                        {product.status === 'announced' && (
                          <Button
                            className="w-full gap-2 h-10"
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
                            <CheckCircle2 className="h-4 w-4" /> Annahme
                          </Button>
                        )}

                        {product.status === 'available' && (
                          <div className="flex gap-2">
                            <Button
                              className="flex-1 gap-2 h-10 bg-green-600 hover:bg-green-700"
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
                              <ShoppingCart className="h-4 w-4" /> Verkauf
                            </Button>
                            <Button
                              variant="outline"
                              className="px-3 h-10"
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
                              title="Rückgabe"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          </div>
                        )}

                        {product.status === 'sold' && (
                          <div className="space-y-2">
                            <Button
                              variant="outline"
                              className="w-full h-10 gap-2 border-green-200 bg-green-50/50 text-green-700 hover:bg-green-50"
                              onClick={() => onDownloadPrivateInvoice(product)}
                            >
                              <Download className="h-4 w-4" /> Rechnung
                            </Button>
                            {isUndoInventoryActionsEnabled && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full h-8 text-[10px] text-muted-foreground"
                                onClick={() =>
                                  onTriggerConfirm(
                                    'undoSale',
                                    product.eventProductId,
                                    product.title,
                                    product.price,
                                    product.discountPercent
                                  )
                                }
                              >
                                <Undo2 className="h-3 w-3 mr-1" /> Storno
                              </Button>
                            )}
                          </div>
                        )}

                        {product.status === 'returned' && isUndoInventoryActionsEnabled && (
                          <Button
                            variant="ghost"
                            className="w-full h-10 gap-2"
                            onClick={() =>
                              onTriggerConfirm(
                                'undoReturn',
                                product.eventProductId,
                                product.title,
                                product.price,
                                product.discountPercent
                              )
                            }
                          >
                            <Undo2 className="h-4 w-4" /> Rückgängig
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {filtered.length === 0 && (
                <div className="col-span-full py-20 text-center bg-muted/20 rounded-xl border-2 border-dashed">
                  <ImageIcon className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-muted-foreground">
                    Keine Produkte in dieser Kategorie gefunden.
                  </p>
                </div>
              )}
            </div>

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
