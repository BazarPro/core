import { SearchInput } from '../../../../components/ui/search-input';
import { ConfirmDialog } from '../../../../components/ui/confirm-dialog';
import { useDeferredValue, useEffect, useMemo, useState, useRef } from 'react';
import { countryName } from '../../../../i18n/countries';
import { useApiClient, useMutation, useQuery } from '../../../../lib/api/react';
import { useEventAccess } from '../../../../hooks/useEventAccess';
import { useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../../../../lib/api/functions';
import type { Id } from '../../../../lib/api/types';
import { useFeatureFlags } from '../../../../hooks/useFeatureFlags';
import {
  useInventoryActions,
  type InventoryActionType,
} from '../../../../hooks/useInventoryActions';
import { downloadPrivateInvoiceForProduct } from '../../../../lib/privateInvoice';
import type { ProductWithStatus } from './components/inventoryTypes';
import {
  ProductManagementList,
  type ProductManagementTab,
} from './components/ProductManagementList';
import { TeamScanner } from '../../../../components/scanner/TeamScanner';
import { WalkInProductDialog } from '../../../../components/walkIn/WalkInProductDialog';
import { UnifiedReturnDialog } from '../../../../components/products/UnifiedReturnDialog';
import { InventoryConfirmDialog } from './components/InventoryConfirmDialog';
import { toast } from 'sonner';
import {
  X,
  UserCircle,
  QrCode,
  Mail,
  Phone,
  CheckCircle2,
  DollarSign,
  Printer,
  ChevronDown,
  ChevronUp,
  MapPin,
  Package,
  Ban,
} from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { Badge } from '../../../../components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '../../../../components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../../components/ui/dropdown-menu';
import { getUserFacingErrorMessage } from '../../../../lib/errors';
import { VendorSettlement } from './components/VendorSettlement';
import { SaleConflictsCard } from './components/SaleConflictsCard';
import { useOfflineIntake } from '../../../../lib/offlineActions';
import { OfflineQueueRefused } from './components/OfflineQueueRefused';
import { useOfflinePreparation } from '../../../../lib/offlinePrefetch';
import { WalkInBadge } from '../../../../components/walkIn/WalkInBadge';
import { LabelPrintDialog } from '../../../../components/products/LabelPrintDialog';
import type { VendorWithCalculations } from '../../../../lib/api/types';
import { SellerNumberBadge } from '../../../../components/sellers/SellerNumberBadge';
import { SortMarkBadge } from '../../../../components/sellers/SortMarkBadge';
import { downloadBasketLabel } from '../../../../lib/sortSheetsPdf';
import {
  downloadSellerPrintout,
  type SellerPrintoutItem,
  type SellerPrintoutKind,
} from '../../../../lib/sellerPrintout';
import { SellerIdCheck } from '../../../../components/sellers/SellerIdCheck';
import { useAssignMissingSellerNumbers } from '../../../../hooks/useAssignMissingSellerNumbers';
import { matchingVendors, productMatcher } from '../../../../lib/productSearch';
import { addToCachedCart } from '../../../../lib/checkout';
import { ReasonField } from '../../../../components/participation/ReasonField';
import { ExcludedBadge } from '../../../../components/participation/ExcludedBadge';
import { formatDateTimeDE } from '../../../../lib/utils';

/** Pause after typing before the search goes into the URL (back button, links) */
const URL_SEARCH_DELAY_MS = 300;
import { useTranslation } from 'react-i18next';
import { PageSkeleton } from '../../../../components/ui/loading';

type ManagedProduct = ProductWithStatus;

export function ProductManagementPage() {
  const { t } = useTranslation('organizer');
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const eventId = params.eventId as Id<'events'>;
  const client = useApiClient();
  const { isUndoInventoryActionsEnabled } = useFeatureFlags();
  const intake = useOfflineIntake(eventId, ({ done, refused }) => {
    if (refused > 0) toast.warning(t('products.offline.refused', { count: refused }));
    else toast.success(t('products.offline.replayed', { count: done }));
  });
  const { performAction, isSubmitting } = useInventoryActions(intake);
  const [labelsOpen, setLabelsOpen] = useState(false);

  // URL-synced state
  const activeTab = (searchParams.get('tab') as ProductManagementTab) || 'all';
  const urlSearchTerm = searchParams.get('q') || '';
  const selectedVendorId = searchParams.get('vendor') as Id<'users'> | null;

  // Local state for immediate UI feedback while typing
  const [localSearchTerm, setLocalSearchTerm] = useState(urlSearchTerm);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [sellerMode, setSellerMode] = useState<'acceptance' | 'payout'>('acceptance');
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const [isContactExpanded, setIsContactExpanded] = useState(false);
  const [walkInProductOpen, setWalkInProductOpen] = useState(false);
  const [editingWalkIn, setEditingWalkIn] = useState<ProductWithStatus | null>(null);
  const [deletingWalkIn, setDeletingWalkIn] = useState<ProductWithStatus | null>(null);
  const deleteWalkInProduct = useMutation(api.walkInSellers.deleteWalkInProduct);
  // Turning an announced item down, with an optional reason for the seller
  const rejectProduct = useMutation(api.eventProducts.rejectProduct);
  const undoRejection = useMutation(api.eventProducts.undoRejection);
  const [rejecting, setRejecting] = useState<ProductWithStatus | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionSaving, setRejectionSaving] = useState(false);
  // Typing stays instant; filtering thousands of items may lag behind a little
  const deferredSearchTerm = useDeferredValue(localSearchTerm);
  // The search last written to the URL, to tell our own writes from the back button
  const writtenSearchTerm = useRef(urlSearchTerm);
  const searchRef = useRef<HTMLDivElement>(null);
  const lastAutoSwitchedVendorId = useRef<Id<'users'> | null>(null);

  // Queries
  const { isLoading: rolesLoading, canManage, can } = useEventAccess(eventId);

  const products = useQuery(
    api.eventProducts.getProductsForEventManagement,
    canManage ? { eventId } : 'skip'
  ) as ManagedProduct[] | undefined;

  const vendors = useQuery(api.eventRoles.getVendorsForEvent, canManage ? { eventId } : 'skip') as
    | VendorWithCalculations[]
    | undefined;

  const locationCategories = useQuery(
    api.eventLocationCategories.listForEvent,
    canManage ? { eventId } : 'skip'
  );
  const event = useQuery(api.events.getEvent, { id: eventId });
  const categories = useQuery(api.categories.getAllCategories);
  // The intake works offline from what is on the device
  useOfflinePreparation(eventId, event, canManage);

  useAssignMissingSellerNumbers(eventId, vendors, canManage);

  const vendorNameById = useMemo(() => {
    const map = new Map<Id<'users'>, string>();
    // "17 · Erika Muster": the number helps to sort items back to their seller
    vendors?.forEach((v) =>
      map.set(v._id, v.sellerNumber ? `${v.sellerNumber} · ${v.name ?? '-'}` : (v.name ?? '-'))
    );
    return map;
  }, [vendors]);

  const walkInVendorIds = useMemo(
    () => new Set(vendors?.filter((v) => v.managedByEventId).map((v) => v._id)),
    [vendors]
  );

  const paidVendorIds = useMemo(
    () => new Set(vendors?.filter((v) => v.paid).map((v) => v._id)),
    [vendors]
  );

  const selectedVendor = useMemo(
    () => vendors?.find((v) => v._id === selectedVendorId),
    [vendors, selectedVendorId]
  );

  const vendorProducts = useMemo(
    () => products?.filter((p) => p.vendorId === selectedVendorId) ?? [],
    [products, selectedVendorId]
  );

  const stats = useMemo(() => {
    const announced = vendorProducts.filter((p) => p.status === 'announced').length;
    const available = vendorProducts.filter((p) => p.status === 'available').length;
    const sold = vendorProducts.filter((p) => p.status === 'sold').length;
    const returned = vendorProducts.filter((p) => p.status === 'returned').length;
    const rejected = vendorProducts.filter((p) => p.status === 'rejected').length;
    return { announced, available, sold, returned, rejected };
  }, [vendorProducts]);

  // Auto-switch to payout mode if all products are already accepted upon vendor selection
  useEffect(() => {
    if (selectedVendorId && selectedVendorId !== lastAutoSwitchedVendorId.current) {
      // Only switch if we have products and none are announced (offen)
      const hasProducts = stats.announced + stats.available + stats.sold + stats.returned > 0;
      if (hasProducts && stats.announced === 0) {
        setSellerMode('payout');
      } else {
        setSellerMode('acceptance');
      }
      lastAutoSwitchedVendorId.current = selectedVendorId;
    }
  }, [selectedVendorId, stats.announced, stats.available, stats.sold, stats.returned]);

  // Helper to update URL params in a stable way
  const updateParams = (updates: Record<string, string | null>) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        Object.entries(updates).forEach(([key, value]) => {
          if (value === null || value === 'all' || value === '') {
            next.delete(key);
          } else {
            next.set(key, value);
          }
        });
        return next;
      },
      { replace: true }
    );
  };

  const setActiveTab = (tab: ProductManagementTab) => updateParams({ tab });
  const setSearchTerm = (q: string) => updateParams({ q, vendor: null });
  const setSelectedVendorId = (vendorId: Id<'users'> | null) =>
    updateParams({ vendor: vendorId, q: null });

  // Sync local state when the URL changes from outside (e.g. back button)
  useEffect(() => {
    if (urlSearchTerm !== writtenSearchTerm.current) {
      writtenSearchTerm.current = urlSearchTerm;
      setLocalSearchTerm(urlSearchTerm);
    }
  }, [urlSearchTerm]);

  // Write the search to the URL once typing pauses, not on every key
  useEffect(() => {
    if (localSearchTerm === writtenSearchTerm.current) return;
    const timer = setTimeout(() => {
      writtenSearchTerm.current = localSearchTerm;
      setSearchTerm(localSearchTerm);
    }, URL_SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localSearchTerm]);

  // Mutations
  const settleVendor = useMutation(api.eventSeller.settleVendor);
  const unmarkVendorPayoutReceived = useMutation(api.eventSeller.unmarkVendorPayoutReceived);

  const vendorSuggestions = useMemo(() => {
    if (!vendors || selectedVendorId) return [];
    return matchingVendors(deferredSearchTerm, vendors);
  }, [vendors, deferredSearchTerm, selectedVendorId]);

  // Handle initial filter from navigation state (processed only once)
  useEffect(() => {
    if (location.state?.productId) {
      const pId = location.state.productId;
      setLocalSearchTerm(pId);
      updateParams({ q: pId, vendor: null, tab: 'all' });
      navigate(location.pathname + location.search, { replace: true, state: {} });
    } else if (location.state?.vendorId) {
      const vId = location.state.vendorId;
      setLocalSearchTerm('');
      updateParams({ vendor: vId, q: '', tab: 'all' });
      navigate(location.pathname + location.search, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, navigate, location.pathname]);

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const vendorById = useMemo(() => new Map(vendors?.map((v) => [v._id, v])), [vendors]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (selectedVendorId) return products.filter((p) => p.vendorId === selectedVendorId);
    return products.filter(productMatcher(deferredSearchTerm, vendorById));
  }, [products, deferredSearchTerm, selectedVendorId, vendorById]);

  const handleBulkAccept = async () => {
    if (!selectedVendorId) return;
    setIsBulkSubmitting(true);
    try {
      const { queued } = await intake.run(
        {
          name: 'eventProducts.markAllVendorProductsAvailable',
          args: { eventId, vendorId: selectedVendorId },
        },
        selectedVendor?.name ?? ''
      );
      toast.success(queued ? t('products.offline.saved') : t('products.allAccepted'));
    } catch (e) {
      toast.error(getUserFacingErrorMessage(e));
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  const handleSettle = async () => {
    if (!selectedVendorId) return;
    setIsBulkSubmitting(true);
    try {
      await settleVendor({ eventId, vendorUserId: selectedVendorId });
      toast.success(t('products.settled'));
    } catch (e) {
      toast.error(getUserFacingErrorMessage(e));
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  const handleUndoSettlement = async () => {
    if (!selectedVendorId) return;
    setIsBulkSubmitting(true);
    try {
      await unmarkVendorPayoutReceived({ eventId, vendorUserId: selectedVendorId });
      toast.success(t('products.unsettled'));
    } catch (e) {
      toast.error(getUserFacingErrorMessage(e));
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  const handlePrintBasketLabel = () => {
    if (selectedVendor?.sortCode === undefined) return;
    void downloadBasketLabel(
      {
        sortCode: selectedVendor.sortCode,
        name: selectedVendor.name ?? '-',
        sellerNumber: selectedVendor.sellerNumber,
      },
      t('sellers.sortClashNote'),
      (vendors ?? []).flatMap((v) => (v.sortCode === undefined ? [] : [v.sortCode]))
    ).catch((e: unknown) => toast.error(getUserFacingErrorMessage(e)));
  };

  const handlePrintSeller = (kind: SellerPrintoutKind) => {
    if (!selectedVendor || !event) return;
    void downloadSellerPrintout(kind, {
      event,
      seller: selectedVendor,
      // Rejected items never took part: neither the item list nor the settlement shows them
      items: vendorProducts.filter((p) => p.status !== 'rejected') as SellerPrintoutItem[],
      categories,
    }).catch((e: unknown) => toast.error(getUserFacingErrorMessage(e)));
  };

  // Individual product action states
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<{
    type: InventoryActionType;
    eventProductId: Id<'eventProducts'>;
    productTitle: string;
    price: number;
    discountPercent?: number;
    vendorId?: Id<'users'>;
  } | null>(null);

  const activeProduct = useMemo(
    () => products?.find((p) => p.eventProductId === activeAction?.eventProductId),
    [products, activeAction]
  );

  const triggerConfirm = (
    type: InventoryActionType,
    eventProductId: Id<'eventProducts'>,
    productTitle: string,
    price: number,
    discountPercent?: number
  ) => {
    const product = products?.find((p) => p.eventProductId === eventProductId);
    setActiveAction({
      type,
      eventProductId,
      productTitle,
      price,
      discountPercent,
      vendorId: product?.vendorId,
    });

    if (type === 'return') setReturnDialogOpen(true);
    else setConfirmDialogOpen(true);
  };

  const handleExecuteAction = async (opts?: {
    locationCategoryId?: Id<'eventLocationCategories'>;
    internalNote?: string;
  }) => {
    if (!activeAction) return;
    const { success, queued } = await performAction(activeAction.type, {
      eventProductId: activeAction.eventProductId,
      label: activeAction.productTitle,
      ...(activeAction.type === 'markAvailable' && opts?.locationCategoryId !== undefined
        ? { locationCategoryId: opts.locationCategoryId }
        : {}),
    });
    if (queued) toast.success(t('products.offline.saved'));
    const previousNote = activeProduct?.internalNote ?? '';
    if (success && opts?.internalNote !== undefined && opts.internalNote.trim() !== previousNote) {
      try {
        await intake.run(
          {
            name: 'eventProducts.setEventProductNote',
            args: { eventProductId: activeAction.eventProductId, note: opts.internalNote },
          },
          activeAction.productTitle
        );
      } catch (error) {
        toast.error(t('products.noteFailed'), {
          description: getUserFacingErrorMessage(error),
        });
      }
    }
    if (success) setConfirmDialogOpen(false);
  };

  const handleConfirmReturn = async () => {
    if (!activeAction) return false;
    const { success, queued } = await performAction('return', {
      eventProductId: activeAction.eventProductId,
      label: activeAction.productTitle,
    });
    if (queued) toast.success(t('products.offline.saved'));
    return success;
  };

  const handleReject = async (e: React.MouseEvent) => {
    if (!rejecting) return;
    // Open while saving; an error keeps the reason for another try
    e.preventDefault();
    setRejectionSaving(true);
    try {
      await rejectProduct({
        eventProductId: rejecting.eventProductId,
        reason: rejectionReason.trim() || undefined,
      });
      toast.success(t('products.rejected', { title: rejecting.title }));
      setRejecting(null);
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    } finally {
      setRejectionSaving(false);
    }
  };

  const handleUndoRejection = async (product: ProductWithStatus) => {
    try {
      await undoRejection({ eventProductId: product.eventProductId });
      toast.success(t('products.rejectionUndone', { title: product.title }));
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    }
  };

  if (rolesLoading) return <PageSkeleton variant="list" />;
  if (!canManage) return null;

  return (
    <div className="container mx-auto space-y-6">
      {intake.refusedWith && intake.pending > 0 && (
        <OfflineQueueRefused
          message={intake.refusedWith}
          pending={t('products.offline.pending', { count: intake.pending })}
          retry={intake.retry}
          discard={intake.discard}
        />
      )}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t('products.title')}
          </h1>
          {/* "Neu verbinden" is in the offline banner above */}
          {intake.pending > 0 && !intake.refusedWith && (
            <p className="mt-1 text-sm font-medium text-amber-700 dark:text-amber-300">
              {t('products.offline.pending', { count: intake.pending })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-80" ref={searchRef}>
            <div className="relative">
              <SearchInput
                placeholder={t('products.search')}
                value={
                  selectedVendorId ? vendorNameById.get(selectedVendorId) || '' : localSearchTerm
                }
                onChange={(e) => {
                  if (selectedVendorId) setSelectedVendorId(null);
                  setLocalSearchTerm(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
              />
              {(localSearchTerm || selectedVendorId) && (
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={t('products.clearSearch')}
                  onClick={() => {
                    writtenSearchTerm.current = '';
                    setLocalSearchTerm('');
                    setSelectedVendorId(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {showSuggestions && vendorSuggestions.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg overflow-hidden animate-in fade-in zoom-in-95">
                <div className="p-2 text-[10px] uppercase font-bold text-muted-foreground bg-muted/50">
                  {t('products.suggestions')}
                </div>
                {vendorSuggestions.map((v) => (
                  <button
                    key={v._id}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left transition-colors"
                    onClick={() => {
                      setSelectedVendorId(v._id);
                      setShowSuggestions(false);
                    }}
                  >
                    <UserCircle className="h-4 w-4 text-primary" />
                    <div className="flex flex-col">
                      <span className="flex items-center gap-1.5 font-medium">
                        {v.name}
                        <SellerNumberBadge number={v.sellerNumber} />
                        {v.managedByEventId && <WalkInBadge />}
                      </span>
                      {v.email && (
                        <span className="text-[10px] text-muted-foreground">{v.email}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsScannerOpen(true)}
            className="h-10 w-10 shrink-0 shadow-sm"
            title={t('products.scan')}
            aria-label={t('products.scan')}
          >
            <QrCode className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <SaleConflictsCard eventId={eventId} />

      {/* Seller Management Card */}
      {selectedVendor && selectedVendor.managedByEventId === eventId && (
        <WalkInProductDialog
          eventId={eventId}
          sellerId={selectedVendor._id}
          sellerName={selectedVendor.name ?? t('products.seller')}
          open={walkInProductOpen}
          onOpenChange={setWalkInProductOpen}
        />
      )}

      {selectedVendor && (
        <div className="bg-card border-2 border-primary/20 rounded-xl p-4 md:p-6 shadow-md animate-in fade-in slide-in-from-top-4">
          <div className="flex flex-col lg:flex-row justify-between gap-4 mb-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 md:h-16 md:w-16 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                <UserCircle className="h-8 w-8 md:h-10 md:w-10" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl md:text-2xl font-bold leading-tight truncate">
                    {selectedVendor.name}
                  </h2>
                  <SellerNumberBadge number={selectedVendor.sellerNumber} />
                  {selectedVendor.managedByEventId && <WalkInBadge />}
                  {selectedVendor.excluded && <ExcludedBadge exclusion={selectedVendor.excluded} />}
                </div>
                <button
                  onClick={() => setIsContactExpanded(!isContactExpanded)}
                  className="flex items-center gap-1 text-xs text-primary font-medium mt-1 hover:underline"
                >
                  {isContactExpanded ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                  {isContactExpanded ? t('products.hideDetails') : t('products.showContact')}
                </button>
              </div>
            </div>

            {/* The same in both tabs: switching them changes only what is below */}
            <div className="flex flex-wrap items-center gap-2 lg:items-start">
              {selectedVendor.paid && (
                <Badge
                  variant="secondary"
                  className="h-9 px-3 text-xs font-semibold gap-1.5 whitespace-nowrap"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> {t('products.settledBadge')}
                </Badge>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Printer className="h-4 w-4" /> {t('products.print')}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    disabled={vendorProducts.length === 0}
                    onSelect={() => setLabelsOpen(true)}
                  >
                    {t('products.labelsPdf')}
                  </DropdownMenuItem>
                  {selectedVendor.sortCode !== undefined && (
                    <DropdownMenuItem onSelect={handlePrintBasketLabel}>
                      {t('products.printBasketLabel')}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    disabled={vendorProducts.length === 0}
                    onSelect={() => handlePrintSeller('items')}
                  >
                    {t('products.printItems')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => handlePrintSeller('settlement')}>
                    {t('products.printSettlement')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {selectedVendor.excluded && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <Ban className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="space-y-1">
                <p>
                  {t('products.excludedNotice', {
                    time: formatDateTimeDE(selectedVendor.excluded.excludedAt),
                  })}
                </p>
                {selectedVendor.excluded.reason && (
                  <p className="text-muted-foreground">
                    {t('participation.reasonQuoted', { reason: selectedVendor.excluded.reason })}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Collapsible Contact Info */}
          {isContactExpanded && (
            <div className="mb-6 p-4 bg-muted/40 rounded-lg space-y-4 animate-in slide-in-from-top-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                    {t('products.contact')}
                  </div>
                  <div className="flex flex-col gap-2">
                    {(selectedVendor.email ?? selectedVendor.contactEmail) && (
                      <a
                        href={`mailto:${selectedVendor.email ?? selectedVendor.contactEmail}`}
                        className="flex items-center gap-2 text-sm text-primary hover:underline transition-colors w-fit"
                      >
                        <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">
                          {selectedVendor.email ?? selectedVendor.contactEmail}
                        </span>
                      </a>
                    )}
                    {selectedVendor.phone && (
                      <a
                        href={`tel:${selectedVendor.phone}`}
                        className="flex items-center gap-2 text-sm text-primary hover:underline transition-colors w-fit"
                      >
                        <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span>{selectedVendor.phone}</span>
                      </a>
                    )}
                  </div>
                </div>

                {(selectedVendor.street || selectedVendor.city) && (
                  <div className="space-y-2 border-t md:border-t-0 md:border-l md:pl-4 pt-4 md:pt-0 border-muted-foreground/20">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                      {t('products.address')}
                    </div>
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                      <div className="flex flex-col">
                        {selectedVendor.street && <span>{selectedVendor.street}</span>}
                        {(selectedVendor.zipCode || selectedVendor.city) && (
                          <span>
                            {selectedVendor.zipCode} {selectedVendor.city}
                          </span>
                        )}
                        {selectedVendor.country && (
                          <span className="text-[10px] uppercase">
                            {countryName(selectedVendor.country)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <Tabs
            value={sellerMode}
            onValueChange={(v) => setSellerMode(v as 'acceptance' | 'payout')}
            className="w-full"
          >
            {/* Settling is up to whom the organizer allows it */}
            {can('payout') && (
              <TabsList className="grid w-full grid-cols-2 mb-4 h-10 md:h-12">
                <TabsTrigger value="acceptance" className="gap-2 text-sm md:text-base px-2">
                  <CheckCircle2 className="h-4 w-4 md:h-5 md:w-5" /> {t('products.acceptance')}
                </TabsTrigger>
                <TabsTrigger value="payout" className="gap-2 text-sm md:text-base px-2">
                  <DollarSign className="h-4 w-4 md:h-5 md:w-5" /> {t('products.settlement')}
                </TabsTrigger>
              </TabsList>
            )}

            {(sellerMode === 'acceptance' || !can('payout')) && (
              <div className="space-y-4">
                {/* Fixed seller data: compare with the ID card before the first intake */}
                {selectedVendor.detailsRecorded === false && (
                  <SellerIdCheck seller={selectedVendor} />
                )}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    {selectedVendor.sortCode !== undefined && (
                      <SortMarkBadge code={selectedVendor.sortCode} className="h-9" />
                    )}
                    <div>
                      <p className="font-semibold">
                        {t('products.itemCount', { count: vendorProducts.length })}
                      </p>
                      {vendorProducts.length > 0 && (
                        <p className="text-sm text-muted-foreground">
                          {[
                            [stats.announced, t('products.countOpen', { count: stats.announced })],
                            [
                              stats.available,
                              t('products.countAccepted', { count: stats.available }),
                            ],
                            [stats.sold, t('products.countSold', { count: stats.sold })],
                            [
                              stats.returned,
                              t('products.countReturned', { count: stats.returned }),
                            ],
                            [
                              stats.rejected,
                              t('products.countRejected', { count: stats.rejected }),
                            ],
                          ]
                            .filter(([count]) => count !== 0)
                            .map(([, label]) => label)
                            .join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                  {can('intake') && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      {selectedVendor.managedByEventId === eventId && !selectedVendor.paid && (
                        <Button
                          variant="outline"
                          className="h-11 gap-2"
                          onClick={() => setWalkInProductOpen(true)}
                        >
                          <Package className="h-4 w-4" /> {t('products.addItem')}
                        </Button>
                      )}
                      <Button
                        className="h-11 gap-2 px-6 text-base shadow-lg"
                        disabled={
                          stats.announced === 0 || isBulkSubmitting || !!selectedVendor?.paid
                        }
                        onClick={handleBulkAccept}
                      >
                        <CheckCircle2 className="h-5 w-5" /> {t('products.acceptAll')}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {sellerMode === 'payout' && can('payout') && (
              <VendorSettlement
                vendor={selectedVendor}
                commissionPercent={event?.commission ?? 0}
                itemsToReturn={vendorProducts.filter((p) => p.status === 'available')}
                soldCount={stats.sold}
                returnedCount={stats.returned}
                notHandedInCount={stats.announced}
                isSubmitting={isBulkSubmitting}
                onSettle={handleSettle}
                onUndo={handleUndoSettlement}
              />
            )}
          </Tabs>
        </div>
      )}

      <ProductManagementList
        products={filteredProducts}
        resolveVendorName={(id) => vendorNameById.get(id) ?? '-'}
        isWalkInVendor={(id) => walkInVendorIds.has(id)}
        isVendorPaid={(id) => paidVendorIds.has(id)}
        isSubmitting={isSubmitting}
        isUndoInventoryActionsEnabled={isUndoInventoryActionsEnabled}
        can={can}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onTriggerConfirm={triggerConfirm}
        onAddToCheckout={(product) => {
          addToCachedCart(eventId, product._id);
          navigate(`/events/view/${eventId}/checkout`);
        }}
        onDownloadPrivateInvoice={(p) => {
          if (!p.sale) {
            toast.error(t('products.noSale'));
            return;
          }
          void downloadPrivateInvoiceForProduct({ client, eventId, product: p, sale: p.sale });
        }}
        onNavigateToProduct={(id) => navigate(`/products/view/${id}`)}
        onSelectVendor={setSelectedVendorId}
        onEditWalkInProduct={setEditingWalkIn}
        onDeleteWalkInProduct={setDeletingWalkIn}
        onReject={(product) => {
          setRejectionReason('');
          setRejecting(product);
        }}
        onUndoRejection={(product) => void handleUndoRejection(product)}
        filterKey={`${deferredSearchTerm}|${selectedVendorId ?? ''}`}
      />

      {editingWalkIn && (
        <WalkInProductDialog
          eventId={eventId}
          sellerId={editingWalkIn.vendorId}
          sellerName={vendorById.get(editingWalkIn.vendorId)?.name ?? t('walkIn.seller')}
          product={editingWalkIn}
          open
          onOpenChange={(open) => !open && setEditingWalkIn(null)}
        />
      )}

      <ConfirmDialog
        open={!!deletingWalkIn}
        onOpenChange={(open) => !open && setDeletingWalkIn(null)}
        title={t('walkIn.deleteTitle', { title: deletingWalkIn?.title })}
        description={t('walkIn.deleteText')}
        confirmLabel={t('list.delete')}
        onConfirm={async () => {
          if (!deletingWalkIn) return;
          try {
            await deleteWalkInProduct({ eventId, productId: deletingWalkIn._id });
            toast.success(t('walkIn.deleted', { title: deletingWalkIn.title }));
          } catch (error) {
            toast.error(getUserFacingErrorMessage(error));
          } finally {
            setDeletingWalkIn(null);
          }
        }}
        destructive
      />

      <ConfirmDialog
        open={!!rejecting}
        onOpenChange={(open) => !open && !rejectionSaving && setRejecting(null)}
        title={t('products.rejectTitle', { title: rejecting?.title })}
        description={t('products.rejectText')}
        confirmLabel={t('products.rejectConfirm')}
        destructive
        loading={rejectionSaving}
        onConfirm={handleReject}
      >
        <ReasonField
          value={rejectionReason}
          onChange={setRejectionReason}
          placeholder={t('products.rejectReasonPlaceholder')}
        />
      </ConfirmDialog>

      <TeamScanner eventId={eventId} open={isScannerOpen} onOpenChange={setIsScannerOpen} />

      <InventoryConfirmDialog
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
        type={activeAction?.type || null}
        productTitle={activeAction?.productTitle}
        saleAmount={activeProduct?.sale?.totalAmount}
        locationCategories={locationCategories}
        initialNote={activeProduct?.internalNote}
        idCheck={
          activeProduct && vendorById.get(activeProduct.vendorId)?.detailsRecorded === false
            ? vendorById.get(activeProduct.vendorId)
            : undefined
        }
        onConfirm={handleExecuteAction}
        isSubmitting={isSubmitting}
      />

      {activeAction && (
        <UnifiedReturnDialog
          open={returnDialogOpen}
          onOpenChange={setReturnDialogOpen}
          productTitle={activeAction.productTitle}
          vendorName={activeAction.vendorId ? vendorNameById.get(activeAction.vendorId) : undefined}
          onConfirmReturn={handleConfirmReturn}
          isSubmitting={isSubmitting}
        />
      )}
      <LabelPrintDialog
        open={labelsOpen}
        onOpenChange={setLabelsOpen}
        selection={(vendorProducts ?? []).map((p) => p._id as Id<'products'>)}
        eventId={eventId}
      />
    </div>
  );
}
