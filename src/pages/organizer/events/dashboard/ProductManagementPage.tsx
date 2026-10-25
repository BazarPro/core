import { useDeferredValue, useEffect, useMemo, useState, useRef } from 'react';
import { useApiClient, useMutation, useQuery } from '../../../../lib/api/react';
import { useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../../../../lib/api/functions';
import type { Id } from '../../../../lib/api/types';
import { useFeatureFlags } from '../../../../hooks/useFeatureFlags';
import {
  useInventoryActions,
  type InventoryActionType,
} from '../../../../hooks/useInventoryActions';
import { downloadPrivateInvoiceForProduct } from '../../../../lib/privateInvoice';
import { provisionalSale } from '../../../../lib/saleBreakdown';
import type { ProductWithStatus } from './components/inventoryTypes';
import {
  ProductManagementList,
  type ProductManagementTab,
} from './components/ProductManagementList';
import { InventoryScannerDialog } from './components/InventoryScannerDialog';
import {
  UnifiedSaleDialog,
  type SaleOptions,
} from '../../../../components/products/UnifiedSaleDialog';
import { resolveEventFeatures } from '../../../../shared/eventFeatures';
import { WalkInProductDialog } from '../../../../components/walkIn/WalkInProductDialog';
import { UnifiedReturnDialog } from '../../../../components/products/UnifiedReturnDialog';
import { InventoryConfirmDialog } from './components/InventoryConfirmDialog';
import { toast } from 'sonner';
import { Input } from '../../../../components/ui/input';
import {
  X,
  UserCircle,
  Search,
  QrCode,
  Mail,
  Phone,
  CheckCircle2,
  DollarSign,
  Download,
  ChevronDown,
  ChevronUp,
  MapPin,
  Package,
} from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { Badge } from '../../../../components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '../../../../components/ui/tabs';
import { getUserFacingErrorMessage } from '../../../../lib/errors';
import { VendorSettlement } from './components/VendorSettlement';
import { SaleConflictsCard } from './components/SaleConflictsCard';
import { WalkInBadge } from '../../../../components/walkIn/WalkInBadge';
import { downloadLabelsPdf } from '../../../../lib/productQRCodePdf';
import type { VendorWithCalculations } from '../../../../lib/api/types';
import { SellerNumberBadge } from '../../../../components/sellers/SellerNumberBadge';
import { SellerIdCheck } from '../../../../components/sellers/SellerIdCheck';
import { useAssignMissingSellerNumbers } from '../../../../hooks/useAssignMissingSellerNumbers';
import { matchingVendors, productMatcher } from '../../../../lib/productSearch';
import { productIdFromCode } from '../../../../lib/checkout';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../../components/ui/alert-dialog';

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
  const { performAction, isSubmitting } = useInventoryActions();
  const setEventProductNote = useMutation(api.eventProducts.setEventProductNote);
  const [lastSale, setLastSale] = useState<{ price: number; viaOffer: boolean } | null>(null);

  // URL-synced state
  const activeTab = (searchParams.get('tab') as ProductManagementTab) || 'all';
  const urlSearchTerm = searchParams.get('q') || '';
  const selectedVendorId = searchParams.get('vendor') as Id<'users'> | null;

  // Local state for immediate UI feedback while typing
  const [localSearchTerm, setLocalSearchTerm] = useState(urlSearchTerm);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [sellerMode, setSellerMode] = useState<'acceptance' | 'payout'>('acceptance');
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const [isContactExpanded, setIsContactExpanded] = useState(false);
  const [walkInProductOpen, setWalkInProductOpen] = useState(false);
  const [editingWalkIn, setEditingWalkIn] = useState<ProductWithStatus | null>(null);
  const [deletingWalkIn, setDeletingWalkIn] = useState<ProductWithStatus | null>(null);
  const deleteWalkInProduct = useMutation(api.walkInSellers.deleteWalkInProduct);
  // Typing stays instant; filtering thousands of items may lag behind a little
  const deferredSearchTerm = useDeferredValue(localSearchTerm);
  // The search last written to the URL, to tell our own writes from the back button
  const writtenSearchTerm = useRef(urlSearchTerm);
  const searchRef = useRef<HTMLDivElement>(null);
  const lastAutoSwitchedVendorId = useRef<Id<'users'> | null>(null);

  // Queries
  const myRoles = useQuery(api.eventRoles.getMyRolesForEvent, { eventId });
  const canManage =
    (myRoles ?? []).includes('organizer') || (myRoles ?? []).includes('coorganizer');

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
  const eventFeatures = event ? resolveEventFeatures(event) : undefined;

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
    return { announced, available, sold, returned };
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
  const markAvailable = useMutation(api.eventProducts.markAllVendorProductsAvailable);
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

  const handleScan = async (input: string) => {
    // 1. Check for User QR
    const userMatch = input.match(/bazarpro:\/\/user\/([a-zA-Z0-9]+)/);
    const userToken = userMatch ? userMatch[1] : null;

    if (userToken) {
      const user = await client.query(api.users.getUserByCheckInToken, {
        token: userToken,
        eventId,
      });
      if (user) {
        setLocalSearchTerm('');
        updateParams({ vendor: user._id, q: '', tab: 'all' });
        setIsScannerOpen(false);
        setScanInput('');
        toast.success(t('products.sellerFound', { name: user.name }));
        return;
      }
    }

    // 2. Check for Product QR
    const productId = productIdFromCode(input) ?? input;

    const found = products?.find((p) => p._id === productId);
    if (found) {
      setLocalSearchTerm(found._id);
      updateParams({ q: found._id, vendor: null, tab: 'all' });
      setIsScannerOpen(false);
      setScanInput('');
      toast.success(t('products.productFound', { title: found.title }));
    } else {
      // Could still be a user token without protocol
      const userByRawToken = await client.query(api.users.getUserByCheckInToken, {
        token: input,
        eventId,
      });
      if (userByRawToken) {
        setLocalSearchTerm('');
        updateParams({ vendor: userByRawToken._id, q: '', tab: 'all' });
        setIsScannerOpen(false);
        setScanInput('');
        toast.success(t('products.sellerFound', { name: userByRawToken.name }));
      } else {
        toast.error(t('products.scanUnknown'));
      }
    }
  };

  const handleBulkAccept = async () => {
    if (!selectedVendorId) return;
    setIsBulkSubmitting(true);
    try {
      await markAvailable({ eventId, vendorId: selectedVendorId });
      toast.success(t('products.allAccepted'));
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

  const handleDownloadAllQRCodes = async () => {
    if (!vendorProducts || vendorProducts.length === 0) {
      toast.error(t('products.noProducts'));
      return;
    }

    const toastId = toast.loading(t('products.labelsCreating'));
    try {
      const count = await downloadLabelsPdf(
        client,
        vendorProducts.map((p) => p._id as Id<'products'>),
        eventId
      );
      toast.success(t('products.labelsCreated', { count }), { id: toastId });
    } catch (e) {
      console.error('QR Export Error:', e);
      toast.error(t('products.labelsFailed'), { id: toastId });
    }
  };

  // Individual product action states
  const [saleDialogOpen, setSaleDialogOpen] = useState(false);
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

    if (type === 'sell') {
      setLastSale(null);
      setSaleDialogOpen(true);
    } else if (type === 'return') setReturnDialogOpen(true);
    else setConfirmDialogOpen(true);
  };

  const handleExecuteAction = async (opts?: {
    locationCategoryId?: Id<'eventLocationCategories'>;
    internalNote?: string;
  }) => {
    if (!activeAction) return;
    const { success } = await performAction(activeAction.type, {
      eventProductId: activeAction.eventProductId,
      ...(activeAction.type === 'markAvailable' && opts?.locationCategoryId !== undefined
        ? { locationCategoryId: opts.locationCategoryId }
        : {}),
    });
    const previousNote = activeProduct?.internalNote ?? '';
    if (success && opts?.internalNote !== undefined && opts.internalNote.trim() !== previousNote) {
      try {
        await setEventProductNote({
          eventProductId: activeAction.eventProductId,
          note: opts.internalNote,
        });
      } catch (error) {
        toast.error(t('products.noteFailed'), {
          description: getUserFacingErrorMessage(error),
        });
      }
    }
    if (success) setConfirmDialogOpen(false);
  };

  const handleConfirmSale = async (options: SaleOptions) => {
    if (!activeAction) return false;
    const { success } = await performAction('sell', {
      eventProductId: activeAction.eventProductId,
      offerId: options.offerId,
      negotiatedPrice: options.negotiatedPrice,
      buyerEmail: options.buyerEmail,
    });
    if (success) {
      setLastSale({ price: options.finalPrice, viaOffer: options.offerId !== undefined });
      if (options.buyerEmail) toast.success(t('products.receiptSent'));
    }
    return success;
  };

  const handleConfirmReturn = async () => {
    if (!activeAction) return false;
    const { success } = await performAction('return', {
      eventProductId: activeAction.eventProductId,
    });
    return success;
  };

  if (myRoles === undefined) return <PageSkeleton variant="list" />;
  if (!canManage) return null;

  return (
    <div className="container mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t('products.title')}</h1>
          <p className="text-muted-foreground text-sm">{t('products.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-80" ref={searchRef}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('products.search')}
                className="pl-10 h-10"
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

            <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-end">
              {selectedVendor.managedByEventId === eventId && !selectedVendor.paid && (
                <Button
                  size="sm"
                  onClick={() => setWalkInProductOpen(true)}
                  className="gap-2 h-9 text-xs"
                >
                  <Package className="h-3.5 w-3.5" /> {t('products.addItem')}
                </Button>
              )}
              {sellerMode === 'acceptance' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadAllQRCodes}
                  className="gap-2 h-9 text-xs"
                >
                  <Download className="h-3.5 w-3.5" /> {t('products.labelsPdf')}
                </Button>
              )}
              {selectedVendor.paid && (
                <Badge
                  variant="secondary"
                  className="h-9 px-3 text-xs font-semibold gap-1.5 whitespace-nowrap"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> {t('products.settledBadge')}
                </Badge>
              )}
            </div>
          </div>

          {/* Fixed seller data: compare with the ID card before the first intake */}
          {sellerMode === 'acceptance' && selectedVendor.detailsRecorded === false && (
            <div className="mb-4">
              <SellerIdCheck seller={selectedVendor} />
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
                          <span className="text-[10px] uppercase">{selectedVendor.country}</span>
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
            <TabsList className="grid w-full grid-cols-2 mb-4 h-10 md:h-12">
              <TabsTrigger value="acceptance" className="gap-2 text-sm md:text-base px-2">
                <CheckCircle2 className="h-4 w-4 md:h-5 md:w-5" /> {t('products.acceptance')}
              </TabsTrigger>
              <TabsTrigger value="payout" className="gap-2 text-sm md:text-base px-2">
                <DollarSign className="h-4 w-4 md:h-5 md:w-5" /> {t('products.settlement')}
              </TabsTrigger>
            </TabsList>

            {sellerMode === 'acceptance' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-muted/30 p-4 rounded-lg">
                  <div className="flex flex-wrap gap-4 md:gap-8 justify-center sm:justify-start w-full sm:w-auto">
                    <div
                      className="text-center cursor-pointer hover:opacity-80"
                      onClick={() => setActiveTab('all')}
                    >
                      <div className="text-xl md:text-2xl font-black">{stats.announced}</div>
                      <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                        {t('products.open')}
                      </div>
                    </div>
                    <div
                      className="text-center cursor-pointer hover:opacity-80"
                      onClick={() => setActiveTab('available')}
                    >
                      <div className="text-xl md:text-2xl font-black text-primary">
                        {stats.available}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                        {t('products.accepted')}
                      </div>
                    </div>
                    {stats.sold > 0 && (
                      <div
                        className="text-center cursor-pointer hover:opacity-80"
                        onClick={() => setActiveTab('sold')}
                      >
                        <div className="text-xl md:text-2xl font-black text-green-600">
                          {stats.sold}
                        </div>
                        <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                          {t('products.sold')}
                        </div>
                      </div>
                    )}
                    {stats.returned > 0 && (
                      <div
                        className="text-center cursor-pointer hover:opacity-80"
                        onClick={() => setActiveTab('returned')}
                      >
                        <div className="text-xl md:text-2xl font-black text-amber-600">
                          {stats.returned}
                        </div>
                        <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                          {t('products.returned')}
                        </div>
                      </div>
                    )}
                  </div>
                  <Button
                    size="default"
                    className="w-full sm:w-auto h-11 px-6 text-base gap-2 shadow-lg"
                    disabled={stats.announced === 0 || isBulkSubmitting || !!selectedVendor?.paid}
                    onClick={handleBulkAccept}
                  >
                    <CheckCircle2 className="h-5 w-5" /> {t('products.acceptAll')}
                  </Button>
                </div>
              </div>
            )}

            {sellerMode === 'payout' && <SaleConflictsCard eventId={eventId} className="mb-4" />}
            {sellerMode === 'payout' && (
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
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onTriggerConfirm={triggerConfirm}
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

      <AlertDialog
        open={!!deletingWalkIn}
        onOpenChange={(open) => !open && setDeletingWalkIn(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('walkIn.deleteTitle', { title: deletingWalkIn?.title })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('walkIn.deleteText')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel', { ns: 'common' })}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
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
            >
              {t('list.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <InventoryScannerDialog
        open={isScannerOpen}
        scanInput={scanInput}
        onOpenChange={setIsScannerOpen}
        onScanInputChange={setScanInput}
        onProcessScan={handleScan}
      />

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
        <>
          <UnifiedSaleDialog
            open={saleDialogOpen}
            onOpenChange={setSaleDialogOpen}
            productTitle={activeAction.productTitle}
            price={activeAction.price}
            discountPercent={activeAction.discountPercent}
            eventProductId={eventFeatures?.priceOffers ? activeAction.eventProductId : undefined}
            minimumPrice={eventFeatures?.minimumPrice ? activeProduct?.minimumPrice : undefined}
            onConfirmSale={handleConfirmSale}
            onDownloadInvoice={async () => {
              // The list may not have the new sale yet right after selling
              const sale =
                activeProduct?.sale ??
                (lastSale !== null
                  ? provisionalSale(
                      activeAction.price,
                      activeAction.discountPercent,
                      lastSale.price,
                      lastSale.viaOffer
                    )
                  : undefined);
              if (!sale) return;
              await downloadPrivateInvoiceForProduct({
                client,
                eventId,
                product: {
                  title: activeAction.productTitle,
                  description: activeProduct?.description || '',
                  images: activeProduct?.images || [],
                },
                sale,
              });
            }}
            isSubmitting={isSubmitting}
          />
          <UnifiedReturnDialog
            open={returnDialogOpen}
            onOpenChange={setReturnDialogOpen}
            productTitle={activeAction.productTitle}
            vendorName={
              activeAction.vendorId ? vendorNameById.get(activeAction.vendorId) : undefined
            }
            onConfirmReturn={handleConfirmReturn}
            isSubmitting={isSubmitting}
          />
        </>
      )}
    </div>
  );
}
