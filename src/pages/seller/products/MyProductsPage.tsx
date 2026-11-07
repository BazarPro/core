import type { ReactNode } from 'react';
import { cn } from '../../../lib/utils';
import { EmptyState } from '../../../components/ui/empty-state';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { useApiClient, useMutation, useQuery } from '../../../lib/api/react';
import { api } from '../../../lib/api/functions';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { Id } from '../../../lib/api/types';

import { useOnboarding } from '../../../context/OnboardingContext';
import { ProductQRCodeDialog } from '../../../components/products/ProductQRCodeDialog';
import { ProductFilters } from '../../../components/products/ProductFilters';
import { Button } from '../../../components/ui/button';
import { downloadPrivateInvoiceForProduct } from '../../../lib/privateInvoice';
import type { InvoiceCopy } from '../../../lib/saleBreakdown';
import { filterAndSortProducts } from '../../../hooks/useMyProductsFilters';
import { BulkEventAssignmentDialog } from './components/BulkEventAssignmentDialog';
import {
  CompleteProductsDialog,
  type ProductCompletion,
} from './components/CompleteProductsDialog';
import type { MyProductCardProduct } from './components/MyProductCard';
import { MyProductsGrid } from './components/MyProductsGrid';
import { MyProductsPageHeader } from './components/MyProductsPageHeader';
import { QuickAddProducts, type QuickAddDraft } from './components/QuickAddProducts';
import {
  autoViewMode,
  loadViewMode,
  saveViewMode,
  type ProductViewMode,
} from '../../../lib/productDisplay';
import { downloadBasketLabel } from '../../../lib/sortSheetsPdf';
import { resolveEventFeatures } from '../../../shared/eventFeatures';
import { LabelPrintDialog } from '../../../components/products/LabelPrintDialog';
import { ProductDiscountDialog } from './components/ProductDiscountDialog';
import { toast } from 'sonner';
import { getUserFacingErrorMessage } from '../../../lib/errors';
import { findProductsToComplete, type ProductToComplete } from '../../../lib/productCompletion';
import { uploadImages } from '../../../lib/uploadImages';
import { AlertTriangle, FileDown, Tag, Trash2, Zap } from 'lucide-react';
import { useMarkNoticesSeen } from '../../../hooks/useMarkNoticesSeen';
import { Trans, useTranslation } from 'react-i18next';
import { ListSkeleton, Loading } from '../../../components/ui/loading';
import { Skeleton } from '../../../components/ui/skeleton';

/**
 * Main Product List View for the Users Producs
 */

export function MyProductsPage() {
  const { t } = useTranslation('seller');
  useMarkNoticesSeen('products');
  const navigate = useNavigate();
  const location = useLocation();
  const client = useApiClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<Id<'products'>[]>([]);
  const [filterEvent, setFilterEvent] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  // Sold items are listed under "Meine Verkäufe"; here they only clutter the list
  const [filterStatus, setFilterStatus] = useState('available');
  const [eventSelectionEventId, setEventSelectionEventId] = useState<Id<'events'> | null>(null);
  const [eventSelectionInitializedFor, setEventSelectionInitializedFor] = useState<string | null>(
    null
  );
  const [isEventSelectionSaving, setIsEventSelectionSaving] = useState(false);

  useEffect(() => {
    const nextFilterEvent = location.state?.filterEvent;
    const nextEventSelection = location.state?.eventSelectEventId as Id<'events'> | undefined;
    if (nextFilterEvent) {
      setFilterEvent(nextFilterEvent);
    }
    if (nextEventSelection) {
      setFilterEvent(nextEventSelection);
      setEventSelectionEventId(nextEventSelection);
    }
    if (nextFilterEvent || nextEventSelection) {
      // Clean up state to avoid re-applying on every navigation
      window.history.replaceState(
        { ...location.state, filterEvent: undefined, eventSelectEventId: undefined },
        ''
      );
    }
  }, [location.state]);
  // Newest first: what was just entered shows at the top
  const [sortBy, setSortBy] = useState('newest');
  const [chosenView, setChosenView] = useState(() => loadViewMode('myProducts'));
  const [quickAddOpen, setQuickAddOpen] = useState(
    () => !!location.state?.quickAdd || localStorage.getItem('bazarpro.quickAddOpen') === '1'
  );
  const toggleQuickAdd = (open: boolean) => {
    setQuickAddOpen(open);
    try {
      localStorage.setItem('bazarpro.quickAddOpen', open ? '1' : '0');
    } catch {
      // Private mode
    }
    if (open) window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [qrCodeDialogOpen, setQrCodeDialogOpen] = useState(false);
  const [selectedProductForQR, setSelectedProductForQR] = useState<{
    id: Id<'products'>;
    title: string;
  } | null>(null);
  const [isBulkEventDialogOpen, setIsBulkEventDialogOpen] = useState(false);
  const [bulkSelectedEvents, setBulkSelectedEvents] = useState<string[]>([]);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const [bulkLabelsOpen, setBulkLabelsOpen] = useState(false);
  const [isBulkSelectionEnabled, setIsBulkSelectionEnabled] = useState(false);
  const [isLabelDialogOpen, setIsLabelDialogOpen] = useState(false);
  // Items that lack e.g. a photo for the target events, and the save that waits for them
  const [completion, setCompletion] = useState<{
    items: ProductToComplete[];
    save: (skipped: Id<'products'>[]) => Promise<void>;
  } | null>(null);

  // Discount Dialog State
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [selectedProductForDiscount, setSelectedProductForDiscount] = useState<{
    productId: Id<'products'>;
    eventId: Id<'events'>;
  } | null>(null);
  const [isDiscountSaving, setIsDiscountSaving] = useState(false);

  const products = useQuery(api.products.getMyProducts);
  const currentUser = useQuery(api.users.viewer);
  const events = useQuery(api.events.getMyRegisteredEvents, {});
  // Bazaars where another seller's labels differ from the own ones by the extra letter only
  const clashes = useQuery(
    api.labels.getSortMarkClashes,
    events?.length ? { eventIds: events.map((event) => event._id) } : 'skip'
  );
  const clashingEvents = (events ?? []).filter(
    (event) => event.endDate >= Date.now() && clashes?.includes(event._id)
  );
  const deleteProducts = useMutation(api.products.deleteProducts);
  const setProductEvents = useMutation(api.eventProducts.setProductEvents);
  const addProductToEvent = useMutation(api.eventProducts.addProductToEvent);
  const removeProductFromEvent = useMutation(api.eventProducts.removeProductFromEvent);
  const updateProductDiscount = useMutation(api.eventProducts.updateProductDiscount);
  const addProductImages = useMutation(api.products.addProductImages);
  const addProductAttributes = useMutation(api.products.addProductAttributes);
  const generateUploadUrl = useMutation(api.products.generateUploadUrl);
  const categoryList = useQuery(api.categories.getAllCategories);
  type ProductItem = NonNullable<typeof products>[number];

  useEffect(() => {
    if (!eventSelectionEventId) {
      setEventSelectionInitializedFor(null);
      return;
    }
    if (!products) return;
    if (eventSelectionInitializedFor === eventSelectionEventId) return;
    const preselected = products
      .filter((p) => p.eventIds?.includes(eventSelectionEventId) && !p.sold)
      .map((p) => p._id);
    setSelectedProducts(preselected);
    setEventSelectionInitializedFor(eventSelectionEventId);
  }, [eventSelectionEventId, eventSelectionInitializedFor, products]);

  const isEventSelectionMode = !!eventSelectionEventId;
  const bulkSelectionEnabled = isEventSelectionMode || isBulkSelectionEnabled;
  const filteredEvent = events?.find((event) => event._id === filterEvent);

  // Discounts are set at the bazaar running now: the filtered one, else the item's own
  const runningEventIds = useMemo(() => {
    const now = Date.now();
    return new Set(
      (events ?? [])
        .filter((event) => event.startDate <= now && now <= event.endDate)
        .map((event) => event._id as string)
    );
  }, [events]);
  const runningEventOf = (product: { eventIds?: string[] }): Id<'events'> | undefined => {
    if (filterEvent !== 'all') {
      return runningEventIds.has(filterEvent) && product.eventIds?.includes(filterEvent)
        ? (filterEvent as Id<'events'>)
        : undefined;
    }
    return product.eventIds?.find((id) => runningEventIds.has(id)) as Id<'events'> | undefined;
  };

  const effectiveFilterEvent = isEventSelectionMode ? 'all' : filterEvent;
  const effectiveFilterStatus = isEventSelectionMode ? 'available' : filterStatus;

  const productsById = useMemo(() => {
    const map = new Map<Id<'products'>, ProductItem>();
    products?.forEach((product) => {
      map.set(product._id, product);
    });
    return map;
  }, [products]);

  const assignedProductIds = useMemo(() => {
    if (!eventSelectionEventId || !products) return new Set<Id<'products'>>();
    return new Set(
      products
        .filter((p) => p.eventIds?.includes(eventSelectionEventId))
        .map((p) => p._id as Id<'products'>)
    );
  }, [eventSelectionEventId, products]);

  const assignedSelectableIds = useMemo(() => {
    if (!eventSelectionEventId || !products) return new Set<Id<'products'>>();
    return new Set(
      products
        .filter((p) => p.eventIds?.includes(eventSelectionEventId) && !p.sold)
        .map((p) => p._id as Id<'products'>)
    );
  }, [eventSelectionEventId, products]);

  const eventProductStatuses = useQuery(
    api.eventProducts.getMyEventProductStatuses,
    filterEvent !== 'all' ? { eventId: filterEvent as Id<'events'> } : 'skip'
  );

  const eventProductStatusMap = useMemo(() => {
    const map = new Map<string, string>();
    eventProductStatuses?.forEach((entry) => {
      map.set(entry.productId, entry.status);
    });
    return map;
  }, [eventProductStatuses]);

  const discountMap = useMemo(() => {
    const map = new Map<string, number>();
    eventProductStatuses?.forEach((entry) => {
      if (entry.discountPercent) {
        map.set(entry.productId, entry.discountPercent);
      }
    });
    return map;
  }, [eventProductStatuses]);

  const isSelectionLocked = (productId: Id<'products'>) => {
    if (!isEventSelectionMode) return false;
    const product = productsById.get(productId);
    if (!product) return false;
    if (product.sold) return true;
    if (!assignedProductIds.has(productId)) return false;
    const status = eventProductStatusMap.get(productId as string);
    return status !== 'announced';
  };

  const toggleProductSelection = (productId: Id<'products'>) => {
    if (isEventSelectionMode) {
      const product = productsById.get(productId);
      if (!product) return;
      if (product.sold) {
        toast.error(t('myProducts.soldCannotAdd'));
        return;
      }
      if (isSelectionLocked(productId)) {
        toast.error(t('myProducts.cannotUnregister'));
        return;
      }
    }
    setSelectedProducts((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const handleLongPressSelect = (productId: Id<'products'>) => {
    if (isEventSelectionMode) return;
    setIsBulkSelectionEnabled(true);
    setSelectedProducts((prev) => (prev.includes(productId) ? prev : [...prev, productId]));
  };

  const handleBulkDelete = async () => {
    try {
      const count = selectedProducts.length;
      await deleteProducts({ ids: selectedProducts });
      setSelectedProducts([]);
      toast.success(t('myProducts.deletedMany', { count }));
    } catch (error) {
      console.error('Failed to delete products:', error);
      toast.error(t('myProducts.deleteFailed'), {
        description: getUserFacingErrorMessage(error),
      });
    }
  };

  const handleDeleteProduct = async (productId: Id<'products'>) => {
    try {
      await deleteProducts({ ids: [productId] });
      setSelectedProducts((prev) => prev.filter((id) => id !== productId));
      toast.success(t('myProducts.deleted'));
    } catch (error) {
      toast.error(t('myProducts.deleteFailed'), {
        description: getUserFacingErrorMessage(error),
      });
    }
  };

  const handleBulkAddToEvent = () => {
    if (selectedProducts.length === 0) return;
    setBulkSelectedEvents([]);
    setIsBulkEventDialogOpen(true);
  };

  /**
   * Saves right away, or first lets the seller complete the items the target events
   * cannot accept yet (e.g. a photo is required). Skipped items are left out of the save.
   */
  const completeThenSave = async (
    productIds: Id<'products'>[],
    targetEventIds: string[],
    save: (skipped: Id<'products'>[]) => Promise<void>
  ) => {
    const items = findProductsToComplete(
      productIds.flatMap((id) => productsById.get(id) ?? []),
      (events ?? []).filter((event) => targetEventIds.includes(event._id)),
      categoryList
    );
    if (items.length === 0) {
      await save([]);
      return false;
    }
    setCompletion({ items, save });
    return true;
  };

  const handleSaveCompletion = async (
    productId: Id<'products'>,
    { files, attributes }: ProductCompletion
  ) => {
    if (Object.keys(attributes).length > 0) {
      await addProductAttributes({ productId, attributes });
    }
    if (files.length > 0) {
      await addProductImages({
        productId,
        images: await uploadImages(client, files, generateUploadUrl),
      });
    }
  };

  const handleSaveBulkEvents = async () => {
    const needsCompletion = await completeThenSave(
      selectedProducts,
      bulkSelectedEvents,
      saveBulkEvents
    );
    if (needsCompletion) setIsBulkEventDialogOpen(false);
  };

  const saveBulkEvents = async (skipped: Id<'products'>[]) => {
    setIsBulkSubmitting(true);
    try {
      for (const productId of selectedProducts.filter((id) => !skipped.includes(id))) {
        await setProductEvents({
          productId,
          eventIds: bulkSelectedEvents.map((id) => id as Id<'events'>),
        });
      }
      toast.success(t('myProducts.eventsUpdated'));
      setIsBulkEventDialogOpen(false);
      setSelectedProducts([]);
    } catch (error) {
      console.error('Failed to update products events:', error);
      toast.error(t('myProducts.updateFailed'), {
        description: getUserFacingErrorMessage(error),
      });
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  const onCreateProduct = () =>
    navigate('/products/new', {
      state: filterEvent !== 'all' ? { initialEventId: filterEvent } : undefined,
    });
  const onEditProduct = (productId: Id<'products'>) => navigate(`/products/edit/${productId}`);
  const onDuplicateProduct = (productId: Id<'products'>) =>
    navigate('/products/new', { state: { copyFrom: productId } });
  const onOpenFullForm = (draft: QuickAddDraft) => navigate('/products/new', { state: { draft } });
  const onViewProduct = (productId: Id<'products'>, productTitle: string) => {
    setSelectedProductForQR({ id: productId, title: productTitle });
    setQrCodeDialogOpen(true);
  };
  const onCardClick = (productId: Id<'products'>) =>
    navigate(`/products/view/${productId}`, { state: { from: 'my-products' } });

  const onUpdateDiscount = (productId: Id<'products'>) => {
    const eventId = runningEventOf(productsById.get(productId) ?? {});
    if (!eventId) return;
    setSelectedProductForDiscount({ productId, eventId });
    setDiscountDialogOpen(true);
  };

  const handleSaveDiscount = async (discount: number) => {
    if (!selectedProductForDiscount) return;
    setIsDiscountSaving(true);
    try {
      await updateProductDiscount({
        eventId: selectedProductForDiscount.eventId,
        productId: selectedProductForDiscount.productId,
        discountPercent: discount,
      });
      toast.success(t('myProducts.discountSaved'));
    } catch (error) {
      console.error('Failed to update discount:', error);
      toast.error(t('myProducts.saveFailed'), {
        description: getUserFacingErrorMessage(error),
      });
    } finally {
      setIsDiscountSaving(false);
    }
  };

  const onDownloadPrivateInvoice = async (product: MyProductCardProduct, copy: InvoiceCopy) => {
    const eventId = product.eventIds?.[0] as Id<'events'> | undefined;
    if (!eventId || !product.sale) {
      toast.error(t('myProducts.invoiceUnavailable'), {
        description: t('myProducts.noSaleFound'),
      });
      return;
    }

    await downloadPrivateInvoiceForProduct({ client, eventId, product, sale: product.sale, copy });
  };

  const { isActive: isOnboardingActive, currentStep: onboardingStep } = useOnboarding();
  const isOnboardingFirstProductStep =
    isOnboardingActive && onboardingStep?.id === 'participant-first-product';

  const filteredEventAssignedCount = products
    ? products.filter((product) => product.eventIds?.includes(filterEvent)).length
    : 0;

  const visibleProducts = products
    ? products.filter((product) => !isEventSelectionMode || !product.sold)
    : [];

  const hiddenSoldCount = products ? products.filter((p) => p.sold).length : 0;
  const filteredProducts = products
    ? filterAndSortProducts(visibleProducts, {
        searchTerm,
        filterEvent: effectiveFilterEvent,
        filterCategory,
        filterStatus: effectiveFilterStatus,
        sortBy,
        minPrice,
        maxPrice,
      })
    : [];

  const eventSelectionStats = useMemo(() => {
    if (!isEventSelectionMode) {
      return { hasChanges: false };
    }
    for (const id of selectedProducts) {
      if (!assignedSelectableIds.has(id)) {
        return { hasChanges: true };
      }
    }
    for (const id of assignedSelectableIds) {
      if (!selectedProducts.includes(id)) {
        return { hasChanges: true };
      }
    }
    return { hasChanges: false };
  }, [assignedSelectableIds, isEventSelectionMode, selectedProducts]);

  const handleSaveEventSelection = async () => {
    if (!eventSelectionEventId) return;
    const toAddIds = selectedProducts.filter((id) => !assignedProductIds.has(id));
    await completeThenSave(toAddIds, [eventSelectionEventId], saveEventSelection);
  };

  const saveEventSelection = async (skipped: Id<'products'>[]) => {
    if (!eventSelectionEventId || !products) return;
    setIsEventSelectionSaving(true);
    try {
      const selectedIds = new Set(selectedProducts);
      const toAdd = products.filter(
        (p) =>
          selectedIds.has(p._id) &&
          !assignedProductIds.has(p._id as Id<'products'>) &&
          !skipped.includes(p._id)
      );
      const toRemove = products.filter(
        (p) =>
          !selectedIds.has(p._id) &&
          assignedSelectableIds.has(p._id as Id<'products'>) &&
          eventProductStatusMap.get(p._id as string) === 'announced'
      );

      for (const product of toAdd) {
        await addProductToEvent({
          eventId: eventSelectionEventId,
          productId: product._id,
          status: 'announced',
        });
      }
      for (const product of toRemove) {
        await removeProductFromEvent({
          eventId: eventSelectionEventId,
          productId: product._id,
        });
      }

      toast.success(t('myProducts.productsUpdated'));
      handleExitEventSelection();
    } catch (error) {
      console.error('Failed to update event products:', error);
      toast.error(t('myProducts.updateFailed'), {
        description: getUserFacingErrorMessage(error),
      });
    } finally {
      setIsEventSelectionSaving(false);
    }
  };

  const handleExitEventSelection = () => {
    setEventSelectionEventId(null);
    setEventSelectionInitializedFor(null);
    setSelectedProducts([]);
    setIsBulkSelectionEnabled(false);
  };

  const handleEnterEventSelection = () => {
    if (filterEvent === 'all') return;
    setEventSelectionInitializedFor(null);
    setSelectedProducts([]);
    setEventSelectionEventId(filterEvent as Id<'events'>);
  };

  const handleClearEventFilter = () => {
    setFilterEvent('all');
  };

  const handleCreateProductForEvent = () => {
    if (filterEvent === 'all') return;
    navigate('/products/new', { state: { initialEventId: filterEvent } });
  };

  const basketLabel = useQuery(api.labels.getMyBasketLabel);
  const printBasketLabel =
    basketLabel && events?.some((event) => resolveEventFeatures(event).labelMark === 'universal')
      ? () =>
          void downloadBasketLabel({
            sortCode: basketLabel.sortCode,
            name: basketLabel.name ?? '',
          }).catch((e: unknown) => toast.error(getUserFacingErrorMessage(e)))
      : undefined;

  const selectedSet = new Set(selectedProducts);
  const selectedForLabels = filteredProducts
    .filter((p) => selectedSet.has(p._id) && !p.sold)
    .map((p) => p._id);

  const selectedProductForDiscountDetails = useMemo(() => {
    if (!selectedProductForDiscount) return null;
    return productsById.get(selectedProductForDiscount.productId);
  }, [selectedProductForDiscount, productsById]);
  const currentDiscount = (productId: Id<'products'>) =>
    discountMap.get(productId) ?? productsById.get(productId)?.discountPercent ?? 0;

  // Until the seller picks a layout, it follows the photos of the items
  const viewMode: ProductViewMode =
    chosenView ?? autoViewMode((products ?? []).filter((p) => !p.sold));
  const changeView = (mode: ProductViewMode) => {
    setChosenView(mode);
    saveViewMode('myProducts', mode);
  };
  const upcomingEvents = (events ?? []).filter((event) => event.endDate >= Date.now());

  return (
    <div className="">
      <div className="container mx-auto">
        {clashingEvents.length > 0 && (
          <p
            role="alert"
            className="mb-4 flex gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            {t('labels.clashAt', { bazaars: clashingEvents.map((e) => e.title).join(', ') })}
          </p>
        )}
        <MyProductsPageHeader
          onCreateProduct={onCreateProduct}
          onQuickAdd={quickAddOpen ? undefined : () => toggleQuickAdd(true)}
          onPrintBasketLabel={printBasketLabel}
          onPrintLabels={
            products?.some((p) => !p.sold) ? () => setIsLabelDialogOpen(true) : undefined
          }
        />

        {!events || !categoryList || (!products && !isOnboardingFirstProductStep) ? (
          <Loading className="space-y-6">
            <Skeleton className="h-10 w-full" />
            <ListSkeleton rows={5} />
          </Loading>
        ) : (
          <>
            {quickAddOpen && currentUser && !isEventSelectionMode && (
              <QuickAddProducts
                vendorId={currentUser._id}
                categories={categoryList}
                events={upcomingEvents}
                filterEvent={filterEvent === 'all' ? undefined : filterEvent}
                onClose={() => toggleQuickAdd(false)}
                onOpenForm={onOpenFullForm}
              />
            )}
            <ProductFilters
              viewMode={viewMode}
              onViewModeChange={changeView}
              extraSortOptions={[{ value: 'newest', label: t('filters.newest') }]}
              defaultSort="newest"
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              filterEvent={filterEvent}
              onFilterEventChange={setFilterEvent}
              events={events}
              eventSelectionMode={isEventSelectionMode}
              filterCategory={filterCategory}
              onFilterCategoryChange={setFilterCategory}
              categories={categoryList}
              filterStatus={effectiveFilterStatus}
              onFilterStatusChange={isEventSelectionMode ? undefined : setFilterStatus}
              sortBy={sortBy}
              onSortChange={setSortBy}
              minPrice={minPrice}
              onMinPriceChange={setMinPrice}
              maxPrice={maxPrice}
              onMaxPriceChange={setMaxPrice}
              showBulkSelection={bulkSelectionEnabled}
              onToggleBulkSelection={
                isEventSelectionMode
                  ? undefined
                  : () =>
                      setIsBulkSelectionEnabled((prev) => {
                        const next = !prev;
                        if (!next) {
                          setSelectedProducts([]);
                        }
                        return next;
                      })
              }
              showEventFilter={!isEventSelectionMode}
              showStatusFilter={!isEventSelectionMode}
            />

            {isBulkSelectionEnabled && !isEventSelectionMode && (
              <SelectionBar title={t('myProducts.selected', { count: selectedProducts.length })}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBulkLabelsOpen(true)}
                  disabled={selectedForLabels.length === 0}
                  className="h-9 sm:h-9 px-3"
                  aria-label={t('myProducts.labelsPdf')}
                >
                  <FileDown className="h-4 w-4 sm:mr-2" />
                  <span className="sm:hidden">{t('myProducts.labelsPdfShort')}</span>
                  <span className="hidden sm:inline">{t('myProducts.labelsPdf')}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkAddToEvent}
                  className="h-9 sm:h-9 px-3"
                  aria-label={t('myProducts.addToEvent')}
                  disabled={selectedProducts.length === 0}
                >
                  <Tag className="h-4 w-4 sm:mr-2" />
                  <span className="sm:hidden">{t('myProducts.addToEventShort')}</span>
                  <span className="hidden sm:inline">{t('myProducts.addToEvent')}</span>
                </Button>
                <ConfirmDialog
                  trigger={
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 sm:h-9 px-3"
                      aria-label={t('myProducts.delete')}
                      disabled={selectedProducts.length === 0}
                    >
                      <Trash2 className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">{t('myProducts.delete')}</span>
                    </Button>
                  }
                  title={t('myProducts.confirmTitle')}
                  description={t('myProducts.confirmDelete')}
                  confirmLabel={t('myProducts.delete')}
                  onConfirm={handleBulkDelete}
                  destructive
                />
              </SelectionBar>
            )}

            {isEventSelectionMode && (
              <SelectionBar
                title={filteredEvent?.title ?? t('myProducts.event')}
                text={t('myProducts.selectedCount', { count: selectedProducts.length })}
              >
                <Button
                  loading={isEventSelectionSaving}
                  type="button"
                  onClick={handleSaveEventSelection}
                  disabled={isEventSelectionSaving || !eventSelectionStats.hasChanges}
                  className="whitespace-nowrap"
                >
                  {isEventSelectionSaving ? t('myProducts.saving') : t('myProducts.saveChanges')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleExitEventSelection}
                  aria-label={t('myProducts.cancelEditing')}
                >
                  {t('actions.cancel', { ns: 'common' })}
                </Button>
              </SelectionBar>
            )}

            {!isEventSelectionMode &&
              !isBulkSelectionEnabled &&
              filterEvent !== 'all' &&
              filteredProducts.length > 0 && (
                <SelectionBar
                  sticky={false}
                  title={filteredEvent?.title ?? t('myProducts.event')}
                  text={t('myProducts.atEvent', { count: filteredEventAssignedCount })}
                >
                  <Button type="button" onClick={handleEnterEventSelection}>
                    {t('myProducts.editAtEvent')}
                  </Button>
                  <Button type="button" variant="outline" onClick={handleClearEventFilter}>
                    {t('myProducts.clearFilter')}
                  </Button>
                </SelectionBar>
              )}

            {!isEventSelectionMode && filterEvent !== 'all' && filteredProducts.length === 0 ? (
              <EmptyState title={t('myProducts.noneForEvent')}>
                <Button type="button" variant="outline" onClick={handleClearEventFilter}>
                  {t('myProducts.clearFilter')}
                </Button>
                <Button type="button" variant="outline" onClick={handleCreateProductForEvent}>
                  {t('myProducts.createForEvent')}
                </Button>
                {!quickAddOpen && (
                  <Button type="button" onClick={() => toggleQuickAdd(true)}>
                    <Zap className="h-4 w-4" />
                    {t('quick.open')}
                  </Button>
                )}
              </EmptyState>
            ) : (
              <>
                {!isEventSelectionMode && filterStatus === 'available' && hiddenSoldCount > 0 && (
                  <p className="text-sm text-muted-foreground mb-4">
                    {t('myProducts.soldHidden', { count: hiddenSoldCount })}{' '}
                    <Trans
                      i18nKey="myProducts.showAllOrSales"
                      ns="seller"
                      components={{
                        all: (
                          <button
                            type="button"
                            className="text-primary underline"
                            onClick={() => setFilterStatus('all')}
                          />
                        ),
                        sales: (
                          <button
                            type="button"
                            className="text-primary underline"
                            onClick={() => navigate('/my-sales')}
                          />
                        ),
                      }}
                    />
                  </p>
                )}
                <MyProductsGrid
                  layout={viewMode}
                  products={isOnboardingFirstProductStep && !products ? [] : filteredProducts}
                  hasProducts={(products?.length ?? 0) > 0}
                  categories={categoryList}
                  selectedProductIds={selectedProducts}
                  onToggleSelection={toggleProductSelection}
                  onEdit={onEditProduct}
                  onDuplicate={onDuplicateProduct}
                  onDelete={handleDeleteProduct}
                  onDownloadPrivateInvoice={onDownloadPrivateInvoice}
                  onViewQR={onViewProduct}
                  onCreateProduct={onCreateProduct}
                  onQuickAdd={quickAddOpen ? undefined : () => toggleQuickAdd(true)}
                  onCardClick={onCardClick}
                  onUpdateDiscount={onUpdateDiscount}
                  discountMap={discountMap}
                  statusMap={eventProductStatusMap}
                  isOngoingFor={(product) => !!runningEventOf(product)}
                  bulkSelectionEnabled={bulkSelectionEnabled}
                  isSelectionLocked={isSelectionLocked}
                  onLongPress={handleLongPressSelect}
                />
              </>
            )}
          </>
        )}
      </div>

      <LabelPrintDialog
        open={bulkLabelsOpen}
        onOpenChange={setBulkLabelsOpen}
        selection={selectedForLabels}
        eventId={filterEvent === 'all' ? undefined : filterEvent}
      />

      {events && products && (
        <LabelPrintDialog
          open={isLabelDialogOpen}
          onOpenChange={setIsLabelDialogOpen}
          events={events}
          products={products}
          eventId={filterEvent === 'all' ? undefined : filterEvent}
        />
      )}

      {selectedProductForQR && (
        <ProductQRCodeDialog
          open={qrCodeDialogOpen}
          onOpenChange={setQrCodeDialogOpen}
          productId={selectedProductForQR.id}
          productTitle={selectedProductForQR.title}
        />
      )}

      {selectedProductForDiscountDetails && (
        <ProductDiscountDialog
          open={discountDialogOpen}
          onOpenChange={setDiscountDialogOpen}
          productTitle={selectedProductForDiscountDetails.title}
          originalPrice={selectedProductForDiscountDetails.price}
          currentDiscount={currentDiscount(selectedProductForDiscountDetails._id)}
          onSave={handleSaveDiscount}
          isSaving={isDiscountSaving}
          maxDiscount={selectedProductForDiscountDetails.discountRules?.maxDiscountPercent}
        />
      )}

      {completion && (
        <CompleteProductsDialog
          items={completion.items}
          onSave={handleSaveCompletion}
          onFinish={async (skipped) => {
            setCompletion(null);
            await completion.save(skipped);
          }}
          onCancel={() => setCompletion(null)}
        />
      )}

      <BulkEventAssignmentDialog
        open={isBulkEventDialogOpen}
        onOpenChange={setIsBulkEventDialogOpen}
        selectedCount={selectedProducts.length}
        selectedEventIds={bulkSelectedEvents}
        onSelectedEventsChange={setBulkSelectedEvents}
        onSave={handleSaveBulkEvents}
        isSubmitting={isBulkSubmitting}
      />
    </div>
  );
}

/** Bar above the grid: what is selected or filtered, and what can be done with it. */
function SelectionBar({
  title,
  text,
  sticky = true,
  children,
}: {
  title: string;
  text?: string;
  sticky?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'mb-4 flex flex-col gap-3 rounded-lg border bg-card/95 p-3 sm:flex-row sm:items-center sm:justify-between',
        sticky && 'sticky top-[72px] z-20 shadow-md backdrop-blur'
      )}
    >
      <div>
        <div className="text-base font-semibold">{title}</div>
        {text && <div className="text-sm text-muted-foreground">{text}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
