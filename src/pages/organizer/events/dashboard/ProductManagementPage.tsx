import { useEffect, useMemo, useState, useRef } from 'react';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../../../../../convex/_generated/api';
import type { Doc, Id } from '../../../../../convex/_generated/dataModel';
import { useFeatureFlags } from '../../../../hooks/useFeatureFlags';
import {
  useInventoryActions,
  type InventoryActionType,
} from '../../../../hooks/useInventoryActions';
import { downloadPrivateInvoiceForProduct } from '../../../../lib/privateInvoice';
import {
  ProductManagementList,
  type ProductManagementTab,
} from './components/ProductManagementList';
import { InventoryScannerDialog } from './components/InventoryScannerDialog';
import { UnifiedSaleDialog } from '../../../../components/products/UnifiedSaleDialog';
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
  ShoppingCart as PosIcon,
  Download,
  ChevronDown,
  ChevronUp,
  MapPin,
  Package,
} from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { Badge } from '../../../../components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '../../../../components/ui/tabs';
import { formatPriceDE } from '../../../../lib/utils';
import { getUserFacingErrorMessage } from '../../../../lib/errors';
import { UnifiedBulkReturnDialog } from '../../../../components/products/UnifiedBulkReturnDialog';
import { UnifiedPayoutDialog } from './components/UnifiedPayoutDialog';
import { downloadProductQRCodesPdf } from '../../../../lib/productQRCodePdf';
import type { VendorWithCalculations } from '../../../../../convex/eventRoles';

type ManagedProduct = Doc<'products'> & {
  eventProductId: Id<'eventProducts'>;
  status: string;
  discountPercent?: number;
};

export function ProductManagementPage() {
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const eventId = params.eventId as Id<'events'>;
  const convex = useConvex();
  const { isUndoInventoryActionsEnabled } = useFeatureFlags();
  const { performAction, isSubmitting } = useInventoryActions();

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
  const [bulkReturnDialogOpen, setBulkReturnDialogOpen] = useState(false);
  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const [isContactExpanded, setIsContactExpanded] = useState(false);
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

  const vendorNameById = useMemo(() => {
    const map = new Map<Id<'users'>, string>();
    vendors?.forEach((v) => map.set(v._id, v.name ?? '-'));
    return map;
  }, [vendors]);

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

  // Sync local state when URL changes (e.g. back button)
  useEffect(() => {
    if (urlSearchTerm !== localSearchTerm) {
      setLocalSearchTerm(urlSearchTerm);
    }
  }, [urlSearchTerm, localSearchTerm]);

  // Mutations
  const markAvailable = useMutation(api.eventProducts.markAllVendorProductsAvailable);
  const markReturned = useMutation(api.eventProducts.markAllVendorProductsReturned);
  const markVendorPayoutReceived = useMutation(api.eventSeller.markVendorPayoutReceived);
  const unmarkVendorPayoutReceived = useMutation(api.eventSeller.unmarkVendorPayoutReceived);

  const vendorSuggestions = useMemo(() => {
    if (!vendors || !localSearchTerm || selectedVendorId) return [];
    const lower = localSearchTerm.toLowerCase();
    return vendors
      .filter(
        (v) => v.name?.toLowerCase().includes(lower) || v.email?.toLowerCase().includes(lower)
      )
      .slice(0, 5);
  }, [vendors, localSearchTerm, selectedVendorId]);

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

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    const searchLower = localSearchTerm.toLowerCase();

    return products.filter((p) => {
      const matchesVendor = !selectedVendorId || p.vendorId === selectedVendorId;
      const matchesSearch =
        !localSearchTerm ||
        p.title.toLowerCase().includes(searchLower) ||
        p._id.toLowerCase().includes(searchLower);

      return matchesVendor && matchesSearch;
    });
  }, [products, localSearchTerm, selectedVendorId]);

  const handleScan = async (input: string) => {
    // 1. Check for User QR
    const userMatch = input.match(/bazarpro:\/\/user\/([a-zA-Z0-9]+)/);
    const userToken = userMatch ? userMatch[1] : null;

    if (userToken) {
      const user = await convex.query(api.users.getUserByCheckInToken, {
        token: userToken,
        eventId,
      });
      if (user) {
        setLocalSearchTerm('');
        updateParams({ vendor: user._id, q: '', tab: 'all' });
        setIsScannerOpen(false);
        setScanInput('');
        toast.success(`Teilnehmer ${user.name} gefunden`);
        return;
      }
    }

    // 2. Check for Product QR
    const productMatch = input.match(/\/products\/view\/([a-zA-Z0-9]+)/);
    const productId = productMatch ? productMatch[1] : input;

    const found = products?.find((p) => p._id === productId);
    if (found) {
      setLocalSearchTerm(found._id);
      updateParams({ q: found._id, vendor: null, tab: 'all' });
      setIsScannerOpen(false);
      setScanInput('');
      toast.success(`Produkt "${found.title}" gefunden`);
    } else {
      // Could still be a user token without protocol
      const userByRawToken = await convex.query(api.users.getUserByCheckInToken, {
        token: input,
        eventId,
      });
      if (userByRawToken) {
        setLocalSearchTerm('');
        updateParams({ vendor: userByRawToken._id, q: '', tab: 'all' });
        setIsScannerOpen(false);
        setScanInput('');
        toast.success(`Teilnehmer ${userByRawToken.name} gefunden`);
      } else {
        toast.error('Scan konnte nicht zugeordnet werden');
      }
    }
  };

  const handleBulkAccept = async () => {
    if (!selectedVendorId) return;
    setIsBulkSubmitting(true);
    try {
      await markAvailable({ eventId, vendorId: selectedVendorId });
      toast.success('Alle Produkte als verfügbar markiert');
    } catch (e) {
      toast.error(getUserFacingErrorMessage(e));
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  const handleStartAuszahlungFlow = () => {
    if (stats.available > 0) {
      setBulkReturnDialogOpen(true);
    } else {
      setPayoutDialogOpen(true);
    }
  };

  const handleBulkReturnConfirmed = async () => {
    if (!selectedVendorId) return;
    setIsBulkSubmitting(true);
    try {
      await markReturned({ eventId, vendorId: selectedVendorId });
      toast.success('Rückgabe abgeschlossen');
      setBulkReturnDialogOpen(false);
      // Immediately trigger the payout dialog
      setPayoutDialogOpen(true);
    } catch (e) {
      toast.error(getUserFacingErrorMessage(e));
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  const handlePayoutConfirmed = async () => {
    if (!selectedVendorId) return;
    setIsBulkSubmitting(true);
    try {
      await markVendorPayoutReceived({ eventId, vendorUserId: selectedVendorId });
      toast.success('Auszahlung abgeschlossen');
      setPayoutDialogOpen(false);
    } catch (e) {
      toast.error(getUserFacingErrorMessage(e));
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  const handleDownloadAllQRCodes = async () => {
    if (!vendorProducts || vendorProducts.length === 0) {
      toast.error('Keine Produkte für diesen Teilnehmer gefunden');
      return;
    }

    const toastId = toast.loading('QR-Codes werden generiert...');
    try {
      const exportData = vendorProducts.map((p) => ({
        productId: p._id as Id<'products'>,
        productTitle: p.title,
      }));
      await downloadProductQRCodesPdf(exportData);
      toast.success(`${vendorProducts.length} QR-Codes generiert`, { id: toastId });
    } catch (e) {
      console.error('QR Export Error:', e);
      toast.error('Fehler beim Generieren der QR-Codes', { id: toastId });
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

    if (type === 'sell') setSaleDialogOpen(true);
    else if (type === 'return') setReturnDialogOpen(true);
    else setConfirmDialogOpen(true);
  };

  const handleExecuteAction = async (opts?: {
    locationCategoryId?: Id<'eventLocationCategories'>;
  }) => {
    if (!activeAction) return;
    const { success } = await performAction(activeAction.type, {
      eventProductId: activeAction.eventProductId,
      ...(activeAction.type === 'markAvailable' && opts?.locationCategoryId !== undefined
        ? { locationCategoryId: opts.locationCategoryId }
        : {}),
    });
    if (success) setConfirmDialogOpen(false);
  };

  const handleConfirmSale = async () => {
    if (!activeAction) return false;
    const { success } = await performAction('sell', {
      eventProductId: activeAction.eventProductId,
    });
    return success;
  };

  const handleConfirmReturn = async () => {
    if (!activeAction) return false;
    const { success } = await performAction('return', {
      eventProductId: activeAction.eventProductId,
    });
    return success;
  };

  if (!canManage)
    return (
      <div className="flex items-center justify-center py-20">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );

  return (
    <div className="container mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Produkt-Management</h1>
          <p className="text-muted-foreground text-sm">
            Einzelabwicklung oder Verkäufer-Bulk-Aktionen
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-80" ref={searchRef}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Produkt oder Verkäufer suchen..."
                className="pl-10 h-10"
                value={
                  selectedVendorId ? vendorNameById.get(selectedVendorId) || '' : localSearchTerm
                }
                onChange={(e) => {
                  const val = e.target.value;
                  setLocalSearchTerm(val);
                  setSearchTerm(val);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
              />
              {(localSearchTerm || selectedVendorId) && (
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setLocalSearchTerm('');
                    setSearchTerm('');
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
                  Teilnehmer vorschläge
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
                      <span className="font-medium">{v.name}</span>
                      <span className="text-[10px] text-muted-foreground">{v.email}</span>
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
            title="Scan QR Code"
          >
            <QrCode className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Seller Management Card */}
      {selectedVendor && (
        <div className="bg-card border-2 border-primary/20 rounded-xl p-4 md:p-6 shadow-md animate-in fade-in slide-in-from-top-4">
          <div className="flex flex-col lg:flex-row justify-between gap-4 mb-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 md:h-16 md:w-16 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                <UserCircle className="h-8 w-8 md:h-10 md:w-10" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl md:text-2xl font-bold leading-tight truncate">
                  {selectedVendor.name}
                </h2>
                <button
                  onClick={() => setIsContactExpanded(!isContactExpanded)}
                  className="flex items-center gap-1 text-xs text-primary font-medium mt-1 hover:underline"
                >
                  {isContactExpanded ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                  {isContactExpanded ? 'Details verbergen' : 'Kontaktdaten anzeigen'}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadAllQRCodes}
                className="gap-2 h-9 text-xs"
              >
                <Download className="h-3.5 w-3.5" /> QR-Codes (PDF)
              </Button>
              {selectedVendor.paid && (
                <Badge
                  variant="secondary"
                  className="h-9 px-3 text-xs font-semibold gap-1.5 whitespace-nowrap"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Auszahlung erfolgt
                </Badge>
              )}
            </div>
          </div>

          {/* Collapsible Contact Info */}
          {isContactExpanded && (
            <div className="mb-6 p-4 bg-muted/40 rounded-lg space-y-4 animate-in slide-in-from-top-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                    Kontakt
                  </div>
                  <div className="flex flex-col gap-2">
                    <a
                      href={`mailto:${selectedVendor.email}`}
                      className="flex items-center gap-2 text-sm text-primary hover:underline transition-colors w-fit"
                    >
                      <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{selectedVendor.email}</span>
                    </a>
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
                      Adresse
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
                <CheckCircle2 className="h-4 w-4 md:h-5 md:w-5" /> Annahme
              </TabsTrigger>
              <TabsTrigger value="payout" className="gap-2 text-sm md:text-base px-2">
                <DollarSign className="h-4 w-4 md:h-5 md:w-5" />
                <span className="hidden sm:inline">Abrechnung & Rückgabe</span>
                <span className="sm:hidden">Abrechnung</span>
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
                        Offen
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
                        Angenommen
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
                          Verkauft
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
                          Rückgabe
                        </div>
                      </div>
                    )}
                  </div>
                  <Button
                    size="default"
                    className="w-full sm:w-auto h-11 px-6 text-base gap-2 shadow-lg"
                    disabled={stats.announced === 0 || isBulkSubmitting}
                    onClick={handleBulkAccept}
                  >
                    <CheckCircle2 className="h-5 w-5" /> Alle annehmen
                  </Button>
                </div>
              </div>
            )}

            {sellerMode === 'payout' && (
              <div className="space-y-6">
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 md:p-6">
                  <div className="flex flex-col lg:flex-row gap-8 items-start justify-between">
                    <div className="flex-1 w-full space-y-6">
                      {/* Detailed Breakdown Table */}
                      <div className="bg-background rounded-lg border overflow-hidden shadow-sm">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-muted/50 border-b">
                              <th className="px-4 py-2 text-left font-semibold">Posten</th>
                              <th className="px-4 py-2 text-right font-semibold">Betrag</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            <tr>
                              <td className="px-4 py-2 flex items-center gap-2 text-muted-foreground">
                                <Package className="h-3.5 w-3.5" />
                                Brutto-Umsatz (Soll)
                              </td>
                              <td className="px-4 py-2 text-right font-medium">
                                {formatPriceDE(selectedVendor.grossRevenue)} €
                              </td>
                            </tr>
                            {selectedVendor.totalDiscount > 0 && (
                              <tr className="text-amber-600 bg-amber-50/30">
                                <td className="px-4 py-2 flex items-center gap-2 pl-6">
                                  <ChevronDown className="h-3.5 w-3.5" />
                                  Gewährte Rabatte
                                </td>
                                <td className="px-4 py-2 text-right font-medium">
                                  -{formatPriceDE(selectedVendor.totalDiscount)} €
                                </td>
                              </tr>
                            )}
                            <tr className="bg-muted/10 font-bold">
                              <td className="px-4 py-2">Netto-Umsatz (Ist)</td>
                              <td className="px-4 py-2 text-right">
                                {formatPriceDE(selectedVendor.totalRevenue)} €
                              </td>
                            </tr>
                            <tr className="text-destructive">
                              <td className="px-4 py-2 pl-6 flex items-center gap-2">
                                <ChevronDown className="h-3.5 w-3.5" />
                                Veranstalter-Provision
                              </td>
                              <td className="px-4 py-2 text-right font-medium">
                                -{formatPriceDE(selectedVendor.commission)} €
                              </td>
                            </tr>
                            <tr className="bg-primary/10 text-primary text-base font-black">
                              <td className="px-4 py-3">Auszahlungsbetrag</td>
                              <td className="px-4 py-3 text-right">
                                {formatPriceDE(selectedVendor.payout)} €
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Horizontal Mini Stats for quick glance */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <div
                          className="p-3 bg-background rounded-lg border cursor-pointer hover:bg-accent transition-colors shadow-sm"
                          onClick={() => setActiveTab('sold')}
                        >
                          <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                            Verkauft
                          </div>
                          <div className="text-lg font-bold flex items-center gap-1.5">
                            {stats.sold}{' '}
                            <span className="text-sm font-normal text-muted-foreground">Art.</span>
                          </div>
                        </div>
                        <div
                          className="p-3 bg-background rounded-lg border cursor-pointer hover:bg-accent transition-colors shadow-sm"
                          onClick={() => setActiveTab('available')}
                        >
                          <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                            Rückgabe
                          </div>
                          <div className="text-lg font-bold text-amber-600 flex items-center gap-1.5">
                            {stats.available}{' '}
                            <span className="text-sm font-normal text-muted-foreground text-amber-600/70">
                              Art.
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="w-full lg:w-auto space-y-4">
                      {!selectedVendor.paid ? (
                        <div className="flex flex-col gap-3">
                          <Button
                            className="w-full h-16 px-8 text-xl gap-3 shadow-xl bg-primary hover:bg-primary/90"
                            onClick={handleStartAuszahlungFlow}
                            disabled={isBulkSubmitting}
                          >
                            <PosIcon className="h-7 w-7" />
                            <span className="sm:inline hidden">Auszahlen & Rückgabe</span>
                            <span className="sm:hidden">Auszahlen</span>
                          </Button>
                          <p className="text-xs text-center text-muted-foreground">
                            Markiert den Verkäufer als bezahlt und <br />
                            setzt alle verbleibenden Artikel auf "Zurückgegeben".
                          </p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-3 w-full sm:min-w-[240px]">
                          <div className="bg-green-100 text-green-700 px-8 py-5 rounded-2xl flex items-center justify-center gap-3 font-black text-xl w-full shadow-inner">
                            <CheckCircle2 className="h-7 w-7" /> ABGESCHLOSSEN
                          </div>
                          {selectedVendorId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-[10px] h-8 text-muted-foreground hover:text-destructive"
                              onClick={() =>
                                unmarkVendorPayoutReceived({
                                  eventId,
                                  vendorUserId: selectedVendorId,
                                })
                              }
                            >
                              Auszahlung zurücknehmen
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Tabs>
        </div>
      )}

      <ProductManagementList
        products={filteredProducts}
        resolveVendorName={(id) => vendorNameById.get(id) ?? '-'}
        isSubmitting={isSubmitting}
        isUndoInventoryActionsEnabled={isUndoInventoryActionsEnabled}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onTriggerConfirm={triggerConfirm}
        onDownloadPrivateInvoice={(p) =>
          downloadPrivateInvoiceForProduct({ convex, eventId, product: p })
        }
        onNavigateToProduct={(id) => navigate(`/products/view/${id}`)}
        onSelectVendor={setSelectedVendorId}
      />

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
        locationCategories={locationCategories}
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
            onConfirmSale={handleConfirmSale}
            onDownloadInvoice={() =>
              downloadPrivateInvoiceForProduct({
                convex,
                eventId,
                product: {
                  title: activeAction.productTitle,
                  description:
                    products?.find((p) => p.eventProductId === activeAction.eventProductId)
                      ?.description || '',
                  price: activeAction.price,
                  images:
                    products?.find((p) => p.eventProductId === activeAction.eventProductId)
                      ?.images || [],
                  discountPercent: activeAction.discountPercent,
                },
              })
            }
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

      {selectedVendor && (
        <UnifiedBulkReturnDialog
          open={bulkReturnDialogOpen}
          onOpenChange={setBulkReturnDialogOpen}
          productCount={stats.available}
          vendorName={selectedVendor.name ?? 'Teilnehmer'}
          onConfirmReturn={handleBulkReturnConfirmed}
          isSubmitting={isBulkSubmitting}
        />
      )}

      {selectedVendor && (
        <UnifiedPayoutDialog
          open={payoutDialogOpen}
          onOpenChange={setPayoutDialogOpen}
          vendorName={selectedVendor.name ?? 'Teilnehmer'}
          payoutAmount={selectedVendor.payout}
          totalRevenue={selectedVendor.totalRevenue}
          commissionAmount={selectedVendor.commission}
          onConfirmPayout={handlePayoutConfirmed}
          isSubmitting={isBulkSubmitting}
          mode="markPaid"
        />
      )}
    </div>
  );
}
