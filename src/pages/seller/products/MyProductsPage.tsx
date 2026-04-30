import { useConvex, useMutation, useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { Id } from '../../../../convex/_generated/dataModel';

import { useOnboarding } from '../../../context/OnboardingContext';
import { ProductQRCodeDialog } from '../../../components/products/ProductQRCodeDialog';
import { ProductFilters } from '../../../components/products/ProductFilters';
import { Button } from '../../../components/ui/button';
import { downloadPrivateInvoiceForProduct } from '../../../lib/privateInvoice';
import { downloadProductQRCodesPdf } from '../../../lib/productQRCodePdf';
import { filterAndSortProducts } from '../../../hooks/useMyProductsFilters';
import { BulkEventAssignmentDialog } from './components/BulkEventAssignmentDialog';
import type { MyProductCardProduct } from './components/MyProductCard';
import { MyProductsGrid } from './components/MyProductsGrid';
import { MyProductsPageHeader } from './components/MyProductsPageHeader';
import { ProductDiscountDialog } from './components/ProductDiscountDialog';
import { toast } from 'sonner';
import { getUserFacingErrorMessage } from '../../../lib/errors';
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
} from '../../../components/ui/alert-dialog';
import { FileDown, Tag, Trash2, X } from 'lucide-react';

/**
 * Main Product List View for the Users Producs
 */

export function MyProductsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const convex = useConvex();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<Id<'products'>[]>([]);
  const [filterEvent, setFilterEvent] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
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
  const [sortBy, setSortBy] = useState('name');
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
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isBulkSelectionEnabled, setIsBulkSelectionEnabled] = useState(false);

  // Discount Dialog State
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [selectedProductForDiscount, setSelectedProductForDiscount] =
    useState<Id<'products'> | null>(null);
  const [isDiscountSaving, setIsDiscountSaving] = useState(false);

  const products = useQuery(api.products.getMyProducts);
  const events = useQuery(api.events.getMyRegisteredEvents, {});
  const deleteProducts = useMutation(api.products.deleteProducts);
  const setProductEvents = useMutation(api.eventProducts.setProductEvents);
  const addProductToEvent = useMutation(api.eventProducts.addProductToEvent);
  const removeProductFromEvent = useMutation(api.eventProducts.removeProductFromEvent);
  const updateProductDiscount = useMutation(api.eventProducts.updateProductDiscount);
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

  const isOngoingEvent = useMemo(() => {
    if (!filteredEvent) return false;
    const now = Date.now();
    return now >= filteredEvent.startDate && now <= filteredEvent.endDate;
  }, [filteredEvent]);

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
        toast.error('Verkaufte Produkte können nicht mehr zu Veranstaltungen hinzugefügt werden.');
        return;
      }
      if (isSelectionLocked(productId)) {
        toast.error('Dieses Produkt kann nicht mehr abgemeldet werden.');
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
      toast.success(`${count} ${count === 1 ? 'Produkt' : 'Produkte'} erfolgreich gelöscht`);
    } catch (error) {
      console.error('Failed to delete products:', error);
      toast.error('Löschen fehlgeschlagen', {
        description: getUserFacingErrorMessage(error),
      });
    }
  };

  const handleBulkAddToEvent = () => {
    if (selectedProducts.length === 0) return;
    setBulkSelectedEvents([]);
    setIsBulkEventDialogOpen(true);
  };

  const handleSaveBulkEvents = async () => {
    setIsBulkSubmitting(true);
    try {
      for (const productId of selectedProducts) {
        await setProductEvents({
          productId,
          eventIds: bulkSelectedEvents.map((id) => id as Id<'events'>),
          status: 'announced',
        });
      }
      toast.success('Veranstaltungs-Zuordnung erfolgreich aktualisiert');
      setIsBulkEventDialogOpen(false);
      setSelectedProducts([]);
    } catch (error) {
      console.error('Failed to update products events:', error);
      toast.error('Aktualisierung fehlgeschlagen', {
        description: getUserFacingErrorMessage(error),
      });
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  const onCreateProduct = () => navigate('/products/new');
  const onEditProduct = (productId: Id<'products'>) => navigate(`/products/edit/${productId}`);
  const onViewProduct = (productId: Id<'products'>, productTitle: string) => {
    setSelectedProductForQR({ id: productId, title: productTitle });
    setQrCodeDialogOpen(true);
  };
  const onCardClick = (productId: Id<'products'>) =>
    navigate(`/products/view/${productId}`, { state: { from: 'my-products' } });

  const onUpdateDiscount = (productId: Id<'products'>) => {
    setSelectedProductForDiscount(productId);
    setDiscountDialogOpen(true);
  };

  const handleSaveDiscount = async (discount: number) => {
    if (!selectedProductForDiscount || filterEvent === 'all') return;
    setIsDiscountSaving(true);
    try {
      await updateProductDiscount({
        eventId: filterEvent as Id<'events'>,
        productId: selectedProductForDiscount,
        discountPercent: discount,
      });
      toast.success('Rabatt erfolgreich aktualisiert');
    } catch (error) {
      console.error('Failed to update discount:', error);
      toast.error('Fehler beim Speichern', {
        description: getUserFacingErrorMessage(error),
      });
    } finally {
      setIsDiscountSaving(false);
    }
  };

  const onDownloadPrivateInvoice = async (
    product: MyProductCardProduct,
    discountPercent?: number
  ) => {
    const eventId = product.eventIds?.[0] as Id<'events'> | undefined;
    if (!eventId) {
      toast.error('Privatrechnung nicht verfügbar', {
        description: 'Für dieses Produkt ist keine Veranstaltung zugeordnet.',
      });
      return;
    }

    await downloadPrivateInvoiceForProduct({
      convex,
      eventId,
      product: {
        ...product,
        discountPercent,
      },
    });
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
    if (!eventSelectionEventId || !products) return;
    setIsEventSelectionSaving(true);
    try {
      const selectedIds = new Set(selectedProducts);
      const toAdd = products.filter(
        (p) => selectedIds.has(p._id) && !assignedProductIds.has(p._id as Id<'products'>)
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

      toast.success('Produkte wurden erfolgreich aktualisiert');
      handleExitEventSelection();
    } catch (error) {
      console.error('Failed to update event products:', error);
      toast.error('Aktualisierung fehlgeschlagen', {
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

  const handleBulkDownloadQR = async () => {
    const selectedSet = new Set(selectedProducts);
    const selectedWithTitles = filteredProducts
      .filter((p) => selectedSet.has(p._id))
      .map((p) => ({ productId: p._id, productTitle: p.title }));
    if (selectedWithTitles.length === 0) return;
    setIsGeneratingPdf(true);
    try {
      await downloadProductQRCodesPdf(selectedWithTitles);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const selectedProductForDiscountDetails = useMemo(() => {
    if (!selectedProductForDiscount) return null;
    return productsById.get(selectedProductForDiscount);
  }, [selectedProductForDiscount, productsById]);

  return (
    <div className="">
      <div className="container mx-auto">
        <MyProductsPageHeader onCreateProduct={onCreateProduct} />

        {!events || !categoryList || (!products && !isOnboardingFirstProductStep) ? (
          <div className="flex items-center justify-center py-20">
            <span className="loading loading-spinner loading-lg text-primary"></span>
          </div>
        ) : (
          <>
            <ProductFilters
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
              <div className="bg-card/95 rounded-lg border p-3 mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sticky top-[72px] z-20 backdrop-blur shadow-md relative">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center text-sm font-semibold dark:bg-amber-500/20 dark:text-amber-200">
                    {selectedProducts.length}
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Mehrfachauswahl
                    </div>
                    <div className="text-base font-semibold">
                      Produkt{selectedProducts.length !== 1 ? 'e' : ''} ausgewählt
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkDownloadQR}
                    disabled={isGeneratingPdf || selectedProducts.length === 0}
                    className="h-9 sm:h-9 px-3"
                    aria-label="QR-Codes als PDF"
                  >
                    <FileDown className="h-4 w-4 sm:mr-2" />
                    <span className="sm:hidden">QR-PDF</span>
                    <span className="hidden sm:inline">
                      {isGeneratingPdf ? 'PDF wird erstellt…' : 'QR-Codes als PDF'}
                    </span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkAddToEvent}
                    className="h-9 sm:h-9 px-3"
                    aria-label="Zu Event hinzufügen"
                    disabled={selectedProducts.length === 0}
                  >
                    <Tag className="h-4 w-4 sm:mr-2" />
                    <span className="sm:hidden">Zu Event</span>
                    <span className="hidden sm:inline">Zu Event hinzufügen</span>
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 sm:h-9 px-3"
                        aria-label="Löschen"
                        disabled={selectedProducts.length === 0}
                      >
                        <Trash2 className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">Löschen</span>
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Bist du sicher?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Diese Aktion kann nicht rückgängig gemacht werden. Alle ausgewählten
                          Produkte werden dauerhaft gelöscht und aus allen Events entfernt.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                        <AlertDialogAction onClick={handleBulkDelete}>Löschen</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                <div className="absolute right-3 top-3 sm:hidden">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setIsBulkSelectionEnabled(false);
                      setSelectedProducts([]);
                    }}
                    aria-label="Mehrfachauswahl beenden"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {isEventSelectionMode && (
              <div className="bg-card/95 rounded-lg border p-3 mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sticky top-[72px] z-20 backdrop-blur shadow-md">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Produktverwaltung
                  </div>
                  <div className="text-base font-semibold">
                    {filteredEvent?.title ?? 'Veranstaltung'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {selectedProducts.length} Produkt
                    {selectedProducts.length !== 1 ? 'e' : ''} ausgewählt
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    onClick={handleSaveEventSelection}
                    disabled={isEventSelectionSaving || !eventSelectionStats.hasChanges}
                    className="whitespace-nowrap"
                  >
                    {isEventSelectionSaving ? 'Speichern…' : 'Änderungen speichern'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleExitEventSelection}
                    aria-label="Bearbeitung abbrechen"
                  >
                    Abbrechen
                  </Button>
                </div>
              </div>
            )}

            {!isEventSelectionMode && !isBulkSelectionEnabled && filterEvent !== 'all' && (
              <div className="bg-card rounded-lg border p-4 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Gefilterte Veranstaltung
                  </div>
                  <div className="text-lg font-semibold">
                    {filteredEvent?.title ?? 'Veranstaltung'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {filteredEventAssignedCount} Produkt
                    {filteredEventAssignedCount !== 1 ? 'e' : ''} bei dieser Veranstaltung
                    ausgewählt
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <Button type="button" onClick={handleEnterEventSelection}>
                    Produkte bei Veranstaltung bearbeiten
                  </Button>
                  <Button type="button" variant="outline" onClick={handleClearEventFilter}>
                    Filter löschen
                  </Button>
                </div>
              </div>
            )}

            {!isEventSelectionMode && filterEvent !== 'all' && filteredProducts.length === 0 ? (
              <div className="bg-card rounded-lg border p-6 text-center space-y-4">
                <div className="text-lg font-semibold">
                  Keine Produkte für diese Veranstaltung gefunden
                </div>
                <p className="text-sm text-muted-foreground">
                  Du kannst den Filter löschen oder direkt ein Produkt für dieses Event erstellen.
                </p>
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <Button type="button" variant="outline" onClick={handleClearEventFilter}>
                    Filter löschen
                  </Button>
                  <Button type="button" onClick={handleCreateProductForEvent}>
                    Produkt für Event erstellen
                  </Button>
                </div>
              </div>
            ) : (
              <MyProductsGrid
                products={isOnboardingFirstProductStep && !products ? [] : filteredProducts}
                categories={categoryList}
                selectedProductIds={selectedProducts}
                onToggleSelection={toggleProductSelection}
                onEdit={onEditProduct}
                onDownloadPrivateInvoice={onDownloadPrivateInvoice}
                onViewQR={onViewProduct}
                onCreateProduct={onCreateProduct}
                onCardClick={onCardClick}
                onUpdateDiscount={onUpdateDiscount}
                discountMap={discountMap}
                isOngoingEvent={isOngoingEvent}
                bulkSelectionEnabled={bulkSelectionEnabled}
                isSelectionLocked={isSelectionLocked}
                onLongPress={handleLongPressSelect}
              />
            )}
          </>
        )}
      </div>

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
          currentDiscount={discountMap.get(selectedProductForDiscountDetails._id) ?? 0}
          onSave={handleSaveDiscount}
          isSaving={isDiscountSaving}
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
