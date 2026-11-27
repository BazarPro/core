import { PageHeader } from '../../../../components/ui/page-header';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BrandMark } from '../../../../components/layout/BrandMark';
import { useApiClient, useMutation, useQuery } from '../../../../lib/api/react';
import { isNetworkError } from '../../../../lib/offlineMode';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  Download,
  Keyboard,
  Mail,
  Maximize2,
  Minimize2,
  ShoppingCart,
  StickyNote,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { api } from '../../../../lib/api/functions';
import type { Id } from '../../../../lib/api/types';
import { EMAIL_PATTERN } from '../../../../shared/constants';
import { Button } from '../../../../components/ui/button';
import { StickyActionBar } from '../../../../components/ui/sticky-action-bar';
import { Checkbox } from '../../../../components/ui/checkbox';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { ImageWithFallback } from '../../../../components/ui/image-with-fallback';
import { QRCodeScanner } from '../../../../components/ui/QRCodeScanner';
import { getUserFacingErrorMessage } from '../../../../lib/errors';
import { cn, formatPrice } from '../../../../lib/utils';
import { Trans, useTranslation } from 'react-i18next';
import { categoryFieldText } from '../../../../i18n/categoryFields';
import { useEventAccess } from '../../../../hooks/useEventAccess';
import { PageSkeleton } from '../../../../components/ui/loading';
import {
  clearCachedCart,
  commissionOf,
  deskCommissions,
  deskTakes,
  getCheckoutCameraEnabled,
  getCheckoutSoundEnabled,
  loadCachedCart,
  parseAmount,
  playScanBeep,
  productIdFromCode,
  saveCachedCart,
  setCheckoutCameraEnabled,
  setCheckoutSoundEnabled,
  type CartEntry,
  type PriceChoice,
} from '../../../../lib/checkout';
import { Skeleton } from '../../../../components/ui/skeleton';
import {
  enqueueSale,
  lookupOffline,
  useOfflineCheckout,
  type CheckoutSnapshot,
  type OfflineSale,
} from '../../../../lib/offlineCheckout';
import { OfflineCheckoutBanner } from './components/OfflineCheckoutBanner';
import { OfflineQueueRefused } from './components/OfflineQueueRefused';
import { useOfflinePreparation } from '../../../../lib/offlinePrefetch';
import { downloadPrivateInvoicesForSale } from '../../../../lib/privateInvoice';
import { provisionalSale } from '../../../../lib/saleBreakdown';
import { resolveEventFeatures } from '../../../../shared/eventFeatures';

/** The same code stays in front of the camera for a moment: ignore repeats meanwhile. */
const REPEAT_SCAN_MS = 2500;

/** What a cart line resolved to: ready to sell with a price, or a problem to fix. */
export type ResolvedLine =
  | {
      ok: true;
      price: number;
      /** Direct sale with a fee cap: the seller and what is left of their cap */
      sellerId?: Id<'users'>;
      feeCapLeft?: number;
      /** The seller's commission when their fee group has its own (#302) */
      commissionPercent?: number;
      /** For the offline queue: what the desk sold and why at this price */
      productId: Id<'products'>;
      title: string;
      /** For the invoice right after the sale */
      invoice: {
        description: string;
        image?: Id<'_storage'>;
        price: number;
        discountPercent?: number;
      };
      source: OfflineSale['items'][number]['priceSource'];
      request: {
        eventProductId: Id<'eventProducts'>;
        offerId?: Id<'productOffers'>;
        negotiatedPrice?: number;
      };
    }
  | { ok: false; problem: string };

/** The cash desk, for whom the organizer lets sell (helper permission "sale"). */
/** The biggest euro note: more change than that is rather a typo */
const LARGEST_NOTE = 500;

const givenKey = (eventId: string | undefined) => `bazarpro.checkout.given.${eventId}`;
function loadGiven(eventId: string | undefined): string {
  try {
    return (eventId && sessionStorage.getItem(givenKey(eventId))) || '';
  } catch {
    return '';
  }
}
function saveGiven(eventId: string | undefined, given: string) {
  if (!eventId) return;
  try {
    if (given) sessionStorage.setItem(givenKey(eventId), given);
    else sessionStorage.removeItem(givenKey(eventId));
  } catch {
    // Private mode: the field is just empty after a reload
  }
}

export function CheckoutPage({ fullscreen = false }: { fullscreen?: boolean }) {
  const { eventId } = useParams<{ eventId: string }>();
  const { isLoading, can } = useEventAccess(eventId as Id<'events'>);
  if (isLoading) return <PageSkeleton />;
  if (!can('sale')) return <NoCashDesk eventId={eventId} />;
  return <CashDesk fullscreen={fullscreen} />;
}

/** The cash desk in full screen, for a tablet or laptop at the bazaar. */
export function FullscreenCheckoutPage() {
  return <CheckoutPage fullscreen />;
}

/**
 * Without the right to sell: no cash desk, but sales this device took offline before
 * still go out (and are refused with "helper.sale"), so they show here with a retry for
 * once the organizer allows selling again, instead of staying on the device unseen.
 */
function NoCashDesk({ eventId }: { eventId: string | undefined }) {
  const { t } = useTranslation('organizer');
  const { t: tErrors } = useTranslation('errors');
  const offline = useOfflineCheckout(eventId);
  return (
    <div className="page-wide space-y-6">
      {offline.pending > 0 && (
        <OfflineQueueRefused
          message={offline.refusedWith ?? tErrors('helper.sale')}
          pending={t('checkout.offline.pending', { count: offline.pending })}
          retry={offline.retry}
        />
      )}
      <div className="p-8 text-center">{tErrors('helper.sale')}</div>
    </div>
  );
}

/**
 * Cash desk with a cart: scan every item of a buyer, check the total, take the money,
 * sell everything in one go. Each line is a live query, so a sale at another desk or a
 * changed discount shows up right away. Without internet the app sells from its copy of
 * the items and books the sales later (lib/offlineCheckout.ts).
 */
function CashDesk({ fullscreen }: { fullscreen: boolean }) {
  const { t } = useTranslation('organizer');
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const sellProducts = useMutation(api.purchases.sellProducts);
  const client = useApiClient();
  const [cart, setCart] = useState<CartEntry[]>(() => (eventId ? loadCachedCart(eventId) : []));
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => getCheckoutSoundEnabled());
  const [cameraOn, setCameraOn] = useState<boolean>(() => getCheckoutCameraEnabled());
  const [resolved, setResolved] = useState<Record<string, ResolvedLine | undefined>>({});
  const [manualCode, setManualCode] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  // The receipt field stays folded away until the buyer asks for one
  const [emailOpen, setEmailOpen] = useState(false);
  // What the buyer handed over, only to work out the change; kept for a reload, like the cart
  const [given, setGiven] = useState(() => loadGiven(eventId));
  useEffect(() => saveGiven(eventId, given), [eventId, given]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSale, setLastSale] = useState<{
    count: number;
    total: number;
    /** Kept on the device, booked once online */
    queued: boolean;
    /** What went back to the buyer, if "Gegeben" was filled in */
    change: number | null;
    lines: Extract<ResolvedLine, { ok: true }>[];
  } | null>(null);
  // Product pages and seller IDs too, for a look at an item without internet
  const event = useQuery(api.events.getEvent, eventId ? { id: eventId as Id<'events'> } : 'skip');
  useOfflinePreparation(eventId, event, true);
  // Direct sale: the buyer paid the seller, the desk books it and takes the commission
  const directSale = !!event && resolveEventFeatures(event).directSale;
  const commissionPercent = event?.commission ?? 0;
  const offline = useOfflineCheckout(eventId, ({ booked, conflicts }) => {
    if (conflicts > 0) {
      toast.warning(t('checkout.offline.conflicts', { count: conflicts }));
    } else {
      toast.success(t('checkout.offline.synced', { count: booked }));
    }
  });
  // The cart and the sum it was ticked for: anything else needs a new look at the money
  const [paidFor, setPaidFor] = useState<string | null>(null);
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);
  const lastScan = useRef<{ code: string; at: number } | null>(null);
  // A hand scanner types into this field, so it keeps the focus between buyers
  const codeInput = useRef<HTMLInputElement>(null);

  const activeEventIdRef = useRef(eventId);
  useEffect(() => {
    if (activeEventIdRef.current !== eventId) {
      activeEventIdRef.current = eventId;
      setCart(eventId ? loadCachedCart(eventId) : []);
      setResolved({});
      return;
    }
    if (!eventId) return;
    if (cart.length > 0) {
      saveCachedCart(eventId, cart);
    } else {
      clearCachedCart(eventId);
    }
  }, [eventId, cart]);

  const cartRef = useRef(cart);
  cartRef.current = cart;
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      setCheckoutSoundEnabled(next);
      return next;
    });
  };

  const toggleCamera = () => {
    setCheckoutCameraEnabled(!cameraOn);
    setCameraOn(!cameraOn);
  };

  const addCode = useCallback(
    (code: string) => {
      const now = Date.now();
      if (lastScan.current?.code === code && now - lastScan.current.at < REPEAT_SCAN_MS) return;
      lastScan.current = { code, at: now };

      const productId = productIdFromCode(code);
      if (!productId) {
        toast.error(t('checkout.notALabel'));
        return;
      }
      if (cartRef.current.some((entry) => entry.productId === productId)) {
        toast.info(t('checkout.alreadyInCart'));
        return;
      }
      setLastSale(null);
      if (soundEnabledRef.current) {
        playScanBeep();
      }
      setCart((current) => {
        if (current.some((entry) => entry.productId === productId)) {
          return current;
        }
        return [
          ...current,
          { productId: productId as Id<'products'>, choice: 'list', negotiatedInput: '' },
        ];
      });
    },
    [setCart, t]
  );

  const updateEntry = (productId: Id<'products'>, change: Partial<CartEntry>) =>
    setCart((current) =>
      current.map((entry) => (entry.productId === productId ? { ...entry, ...change } : entry))
    );

  const removeEntry = (productId: Id<'products'>) => {
    setCart((current) => current.filter((entry) => entry.productId !== productId));
    setResolved((current) => ({ ...current, [productId]: undefined }));
  };

  const clearCart = () => {
    setCart([]);
    setResolved({});
    setGiven('');
    if (eventId) clearCachedCart(eventId);
  };

  // Lines report by value: an unchanged result must not cause another render
  const onResolved = useCallback(
    (productId: Id<'products'>, line: ResolvedLine | undefined) =>
      setResolved((current) =>
        JSON.stringify(current[productId]) === JSON.stringify(line)
          ? current
          : { ...current, [productId]: line }
      ),
    []
  );

  const lines = cart.map((entry) => resolved[entry.productId]);
  const allReady = cart.length > 0 && lines.every((line) => line?.ok);
  const total = lines.reduce((sum, line) => sum + (line?.ok ? line.price : 0), 0);
  const ready = lines.flatMap((line) => (line?.ok ? [line] : []));
  // Direct sale: the commission of each item, items of one seller share their fee cap
  const commissions = deskCommissions(ready, commissionPercent);
  const commissionOfLine = new Map(
    ready.map((line, index) => [line.productId, commissions[index]])
  );
  const taken = directSale
    ? commissions.reduce((sum, commission) => Math.round((sum + commission) * 100) / 100, 0)
    : deskTakes(
        ready.map((line) => line.price),
        false,
        commissionPercent
      );
  const emailValid = buyerEmail.trim() === '' || EMAIL_PATTERN.test(buyerEmail.trim());
  const saleKey = `${cart.map((entry) => entry.productId).join()}:${total}`;
  const moneyReceived = paidFor === saleKey;
  // What the buyer pays at this desk, and the change for what they handed over
  const due = directSale ? taken : total;
  const givenAmount = parseAmount(given);
  const givenInvalid = given.trim() !== '' && givenAmount === null;
  const change = givenAmount === null ? null : Math.round((givenAmount - due) * 100) / 100;
  // More change than the biggest note: rather a typo, e.g. a label scanned into this field
  const changeUnlikely = change !== null && allReady && change >= LARGEST_NOTE;
  const changeText =
    change === null || !allReady
      ? ''
      : change < 0
        ? t('checkout.missing', { amount: formatPrice(-change) })
        : t('checkout.change', { amount: formatPrice(change) });
  // Read out once the typing pauses, not at every key
  const [announcedChange, setAnnouncedChange] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setAnnouncedChange(changeText), 400);
    return () => clearTimeout(timer);
  }, [changeText]);
  // The step the desk is at: scan, take the money, complete
  const step = cart.length === 0 ? 1 : moneyReceived ? 3 : 2;

  const nextBuyer = () => {
    setCart([]);
    setResolved({});
    setBuyerEmail('');
    setEmailOpen(false);
    setGiven('');
    if (eventId) clearCachedCart(eventId);
    codeInput.current?.focus();
  };

  /** Keeps the sale on the device; the money is taken, so it is done for the buyer. */
  const queueSale = async (deskSaleId: string, ready: Extract<ResolvedLine, { ok: true }>[]) => {
    // What this cart takes from each seller's fee cap, so the next offline cart starts
    // from the rest
    const feeCapSpent: Record<string, number> = {};
    if (directSale) {
      for (const line of ready) {
        const commission = commissionOfLine.get(line.productId);
        if (line.sellerId === undefined || line.feeCapLeft === undefined || !commission) continue;
        feeCapSpent[line.sellerId] =
          Math.round(((feeCapSpent[line.sellerId] ?? 0) + commission) * 100) / 100;
      }
    }
    await enqueueSale(
      eventId!,
      {
        deskSaleId,
        soldAt: Date.now(),
        buyerEmail: buyerEmail.trim() || undefined,
        // The desk took the money this way; it is booked so even if the event changes
        directSale,
        items: ready.map((line) => ({
          eventProductId: line.request.eventProductId,
          productId: line.productId,
          title: line.title,
          paid: line.price,
          priceSource: line.source,
          offerId: line.request.offerId,
        })),
      },
      feeCapSpent
    );
    setLastSale({
      count: ready.length,
      total: taken,
      queued: true,
      lines: ready,
      change: change !== null && change >= 0 ? change : null,
    });
    nextBuyer();
  };

  const submit = async () => {
    const ready = lines.flatMap((line) => (line?.ok ? [line] : []));
    // The same ID for a retry, so a sale whose reply got lost is not booked twice
    const deskSaleId = crypto.randomUUID();
    setIsSubmitting(true);
    try {
      if (offline.offline) {
        await queueSale(deskSaleId, ready);
        return;
      }
      const result = await sellProducts({
        items: ready.map((line) => line.request),
        buyerEmail: buyerEmail.trim() || undefined,
        deskSaleId,
      });
      setLastSale({
        count: result.purchaseIds.length,
        // Older backends do not send what the desk took
        total: result.taken ?? result.total,
        queued: false,
        lines: ready,
        change: change !== null && change >= 0 ? change : null,
      });
      if (buyerEmail.trim()) toast.success(t('checkout.receiptSent'));
      nextBuyer();
    } catch (error) {
      // No answer from the backend: in the app the sale goes into the queue. Other errors
      // show, the team must not take money for a sale that may be refused later
      if (offline.available && isNetworkError(error)) {
        try {
          await queueSale(deskSaleId, ready);
          return;
        } catch {
          // Not even stored on the device: the cart stays
        }
      }
      toast.error(getUserFacingErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const createInvoice = async () => {
    if (!lastSale) return;
    setIsCreatingInvoice(true);
    try {
      await downloadPrivateInvoicesForSale(
        client,
        lastSale.lines.map((line) => ({
          product: {
            title: line.title,
            description: line.invoice.description,
            images: line.invoice.image ? [line.invoice.image] : [],
          },
          sale: provisionalSale(
            line.invoice.price,
            line.invoice.discountPercent,
            line.price,
            line.source === 'offer'
          ),
        }))
      );
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    } finally {
      setIsCreatingInvoice(false);
    }
  };

  if (!eventId) return null;

  const desk = (
    <>
      <OfflineCheckoutBanner {...offline} />
      {offline.refusedWith && offline.pending > 0 && (
        <OfflineQueueRefused
          message={offline.refusedWith}
          pending={t('checkout.offline.pending', { count: offline.pending })}
          retry={offline.retry}
        />
      )}

      {/* grid-cols-1: an implicit column would grow with the widest line on a phone */}
      <div
        className={cn(
          'grid grid-cols-1 gap-6',
          fullscreen
            ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]'
            : 'lg:grid-cols-[minmax(0,320px)_1fr]'
        )}
      >
        <section className="space-y-4 self-start rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <StepHeading step={1} active={step === 1}>
              {t('checkout.steps.scan')}
            </StepHeading>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={toggleSound}
              className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
              aria-label={soundEnabled ? t('checkout.soundOff') : t('checkout.soundOn')}
            >
              {soundEnabled ? (
                <>
                  <Volume2 className="h-4 w-4 text-primary" />
                  <span>{t('checkout.soundIsOn')}</span>
                </>
              ) : (
                <>
                  <VolumeX className="h-4 w-4" />
                  <span>{t('checkout.soundIsOff')}</span>
                </>
              )}
            </Button>
          </div>
          {fullscreen && !cameraOn ? (
            // Full screen: the scanner is the big thing on the left, one tap turns it on
            <button
              type="button"
              aria-pressed={false}
              onClick={toggleCamera}
              className="flex aspect-[2/1] w-full flex-col sm:aspect-[4/3] items-center justify-center gap-3 rounded-xl border-2 border-dashed border-input bg-muted/40 text-muted-foreground transition-colors hover:border-primary hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
            >
              <Camera className="size-10" />
              <span className="font-semibold">{t('checkout.cameraOn')}</span>
            </button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              aria-pressed={cameraOn}
              onClick={toggleCamera}
            >
              {cameraOn ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
              {cameraOn ? t('checkout.cameraOff') : t('checkout.cameraOn')}
            </Button>
          )}
          {/* With items in the cart it takes less room on phones: the cart comes next */}
          {cameraOn && <QRCodeScanner onScanSuccess={addCode} compact={cart.length > 0} />}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              lastScan.current = null;
              addCode(manualCode);
              setManualCode('');
            }}
          >
            <Input
              ref={codeInput}
              autoFocus
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder={t('checkout.codePlaceholder')}
              aria-label={t('checkout.code')}
            />
            <Button type="submit" variant="outline" size="icon" aria-label={t('checkout.add')}>
              <Keyboard className="h-4 w-4" />
            </Button>
          </form>
        </section>

        {/* A column of flex items: on phones the receipt button moves above the sum bar */}
        <section className="flex flex-col gap-4">
          {lastSale && cart.length === 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-success/30 bg-success-soft p-4 text-success-soft-foreground">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <p className="min-w-0 flex-1 basis-48">
                <Trans
                  i18nKey={
                    directSale
                      ? lastSale.queued
                        ? 'checkout.offline.queuedDirect'
                        : 'checkout.soldDirect'
                      : lastSale.queued
                        ? 'checkout.offline.queued'
                        : 'checkout.sold'
                  }
                  ns="organizer"
                  count={lastSale.count}
                  values={{ total: formatPrice(lastSale.total) }}
                  components={{ b: <b /> }}
                />
                {/* The change stays in sight after the tap: the helper may still count it out */}
                {lastSale.change !== null && lastSale.change > 0 && (
                  <span className="ml-1 font-semibold">
                    {t('checkout.changeGiven', { amount: formatPrice(lastSale.change) })}
                  </span>
                )}
              </p>
              <Button
                variant="outline"
                className="gap-2 max-sm:w-full"
                loading={isCreatingInvoice}
                disabled={isCreatingInvoice}
                onClick={() => void createInvoice()}
              >
                <Download className="h-4 w-4" /> {t('checkout.invoice')}
              </Button>
            </div>
          )}

          {cart.length === 0 ? (
            // Wide screens: the cart keeps its place at full height, waiting for the first item
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-card/50 p-10 text-center text-muted-foreground lg:min-h-[calc(100svh-16rem)]">
              <span className="flex size-16 items-center justify-center rounded-full bg-muted">
                <ShoppingCart className="h-8 w-8" />
              </span>
              <p>{t('checkout.empty')}</p>
            </div>
          ) : (
            <>
              <h2 className="flex items-center gap-2 text-base font-bold">
                <ShoppingCart className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                {t('checkout.steps.cart')}
                <span className="ml-auto font-sans text-sm font-normal text-muted-foreground">
                  {t('checkout.items', { count: cart.length })}
                </span>
              </h2>
              <ul className="divide-y rounded-xl border bg-card">
                {cart.map((entry) => (
                  <CartLine
                    key={entry.productId}
                    eventId={eventId as Id<'events'>}
                    entry={entry}
                    offline={offline.offline}
                    snapshot={offline.snapshot}
                    directSale={directSale}
                    commissionPercent={commissionPercent}
                    commission={commissionOfLine.get(entry.productId)}
                    onChange={(change) => updateEntry(entry.productId, change)}
                    onRemove={() => removeEntry(entry.productId)}
                    onResolved={onResolved}
                  />
                ))}
              </ul>
            </>
          )}

          {cart.length > 0 && (
            <>
              {/* Sum and the way to finish stay in reach, however long the cart is */}
              <StickyActionBar className="gap-2 max-lg:order-last lg:bottom-4 lg:mx-0 lg:gap-3 lg:rounded-xl lg:border lg:bg-card lg:p-4 lg:shadow-lg lg:backdrop-blur-none">
                {/* Step 2 names itself on phones too: where the money part begins */}
                <div className="w-full">
                  <StepHeading step={2} active={step === 2}>
                    {t('checkout.steps.money')}
                  </StepHeading>
                </div>
                {directSale && (
                  <div className="flex w-full items-baseline justify-between text-sm text-muted-foreground">
                    <span>{t('checkout.direct.paidToSeller')}</span>
                    <span className="tabular-nums">{formatPrice(total)} €</span>
                  </div>
                )}
                <div className="flex w-full items-baseline justify-between">
                  <span>
                    {directSale
                      ? ready.some(
                          (line) =>
                            line.commissionPercent !== undefined &&
                            line.commissionPercent !== commissionPercent
                        )
                        ? // Sellers of fee groups pay their own percentage
                          t('checkout.direct.sumMixed', { count: ready.length })
                        : t('checkout.direct.sum', {
                            count: ready.length,
                            percent: commissionPercent,
                          })
                      : // Only what the sum holds: marked items are not part of it
                        t('checkout.sum', { count: ready.length })}
                  </span>
                  <span className="font-display text-2xl font-extrabold tabular-nums lg:text-4xl">
                    {formatPrice(taken)} €
                  </span>
                </div>
                <div className="flex w-full items-center gap-2 sm:gap-3">
                  <Label htmlFor="checkout-given" className="min-w-0 text-sm text-muted-foreground">
                    {t('checkout.given')}
                  </Label>
                  <div className="relative shrink-0">
                    <Input
                      id="checkout-given"
                      inputMode="decimal"
                      autoComplete="off"
                      className="h-10 w-24 pr-7 text-right tabular-nums sm:w-28"
                      value={given}
                      onChange={(e) => setGiven(e.target.value)}
                      aria-invalid={givenInvalid || undefined}
                      aria-describedby={givenInvalid ? 'checkout-given-hint' : undefined}
                    />
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
                    >
                      €
                    </span>
                  </div>
                  {givenInvalid && (
                    <span id="checkout-given-hint" className="ml-auto text-sm text-destructive">
                      {t('checkout.givenInvalid')}
                    </span>
                  )}
                  {/* Read out as it changes: the change is what the helper hands back */}
                  <span className="ml-auto shrink-0 empty:hidden">
                    {change !== null && allReady && (
                      <span
                        aria-hidden="true"
                        data-testid="checkout-change"
                        className={cn(
                          'block whitespace-nowrap rounded-lg px-2.5 py-1.5 font-display text-base font-extrabold tabular-nums sm:px-3 sm:text-lg',
                          change < 0
                            ? 'bg-danger-soft text-danger-soft-foreground'
                            : 'bg-tag-soft text-tag-soft-foreground'
                        )}
                      >
                        {changeText}
                      </span>
                    )}
                  </span>
                  <span aria-live="polite" className="sr-only">
                    {announcedChange}
                  </span>
                </div>
                {/* A sale is only one tap away otherwise; a changed cart asks again */}
                <Label
                  htmlFor="checkout-money-received"
                  className={cn(
                    'flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg border bg-card px-3 py-2 text-base font-semibold',
                    moneyReceived && 'border-success bg-success-soft text-success-soft-foreground'
                  )}
                >
                  <Checkbox
                    id="checkout-money-received"
                    checked={moneyReceived}
                    disabled={!allReady || isSubmitting}
                    onCheckedChange={(checked) => setPaidFor(checked ? saleKey : null)}
                    className="size-5"
                  />
                  {directSale
                    ? t('checkout.direct.received', { total: formatPrice(taken) })
                    : t('checkout.received', { total: formatPrice(total) })}
                </Label>
                <div className="flex w-full gap-2">
                  <Button
                    loading={isSubmitting}
                    size="lg"
                    className="h-auto min-h-12 min-w-0 flex-1 whitespace-normal text-base"
                    disabled={!allReady || !emailValid || !moneyReceived || isSubmitting}
                    onClick={submit}
                  >
                    {!isSubmitting && <StepNumber step={3} active={step === 3} onPrimary />}
                    {isSubmitting ? t('checkout.selling') : t('checkout.complete')}
                  </Button>
                  <Button size="lg" variant="outline" onClick={clearCart} disabled={isSubmitting}>
                    {t('checkout.clear')}
                  </Button>
                </div>
                {/* The tick stays by hand (#251); a contradiction only gets a word */}
                {moneyReceived && change !== null && change < 0 && (
                  <p className="flex items-center gap-2 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {t('checkout.missingButReceived', { amount: formatPrice(-change) })}
                  </p>
                )}
                {changeUnlikely && (
                  <p className="flex items-center gap-2 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {t('checkout.changeUnlikely')}
                  </p>
                )}
                {!allReady && lines.some((line) => line && !line.ok) && (
                  <p className="flex items-center gap-2 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    {t('checkout.removeMarked')}
                  </p>
                )}
              </StickyActionBar>
              {emailOpen || buyerEmail ? (
                <div className="space-y-1 rounded-xl border bg-card p-4">
                  <Label htmlFor="checkout-email">{t('checkout.email')}</Label>
                  <Input
                    id="checkout-email"
                    type="email"
                    autoFocus={emailOpen}
                    value={buyerEmail}
                    onChange={(e) => setBuyerEmail(e.target.value)}
                    placeholder={t('checkout.emailPlaceholder')}
                  />
                  {!emailValid && (
                    <p className="text-xs text-destructive">{t('checkout.emailInvalid')}</p>
                  )}
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => setEmailOpen(true)}
                >
                  <Mail className="h-4 w-4" /> {t('checkout.addEmail')}
                </Button>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );

  if (fullscreen) {
    return (
      <div className="flex min-h-svh flex-col">
        <DeskBar
          eventTitle={event?.title}
          offline={offline.offline}
          onLeave={() => navigate(`/events/view/${eventId}/checkout`)}
        />
        <div className="mx-auto w-full max-w-[96rem] flex-1 space-y-6 p-4 lg:p-6">{desk}</div>
      </div>
    );
  }
  return (
    <div className="page-wide space-y-6">
      <PageHeader
        title={t('checkout.title')}
        actions={
          <Button asChild variant="outline" className="max-sm:hidden">
            <Link to={`/events/view/${eventId}/checkout/fullscreen`}>
              <Maximize2 className="h-4 w-4" />
              {t('checkout.fullscreen')}
            </Link>
          </Button>
        }
      />
      {desk}
    </div>
  );
}

/**
 * The bar of the full-screen desk: which bazaar, whether the desk is online, and the
 * way back. Dark petrol in both themes, so the desk reads as its own place.
 */
function DeskBar({
  eventTitle,
  offline,
  onLeave,
}: {
  eventTitle: string | undefined;
  offline: boolean;
  onLeave: () => void;
}) {
  const { t } = useTranslation('organizer');
  return (
    <header className="flex items-center gap-3 bg-primary-shade dark:bg-brand-panel px-4 py-2.5 text-white sm:gap-4 sm:px-6">
      <BrandMark onDark className="h-7 w-7" />
      <p className="min-w-0 flex-1 truncate text-sm">
        <span className="font-bold">{t('checkout.title')}</span>
        {eventTitle && <span className="text-white/75"> · {eventTitle}</span>}
      </p>
      <span className="flex shrink-0 items-center gap-2 text-sm text-white/85">
        <span
          aria-hidden="true"
          className={cn('size-2 rounded-full', offline ? 'bg-tag' : 'bg-[#7ed67a]')}
        />
        {offline ? t('checkout.offlineShort') : t('checkout.online')}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={onLeave}
        className="shrink-0 border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white dark:bg-white/10"
      >
        <Minimize2 className="h-4 w-4" />
        <span className="max-sm:sr-only">{t('checkout.leave')}</span>
      </Button>
    </header>
  );
}

/**
 * The number of a desk step. The step due now is tag yellow with a dark ring, so it
 * stands out by more than its colour; on a filled button it sits on a light disc.
 */
function StepNumber({
  step,
  active,
  onPrimary = false,
  className,
}: {
  step: number;
  active: boolean;
  onPrimary?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full font-display text-sm font-extrabold',
        active
          ? 'bg-tag text-tag-foreground ring-2 ring-foreground ring-offset-1 ring-offset-transparent'
          : onPrimary
            ? // follows the button: light on petrol, muted while it is off
              'border-2 border-current'
            : 'border-2 border-input text-muted-foreground',
        className
      )}
    >
      {step}
    </span>
  );
}

/** A numbered step of the desk; the step due now is marked, also for screen readers. */
function StepHeading({
  step,
  active,
  children,
}: {
  step: number;
  active: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation('organizer');
  return (
    <h2
      className="flex items-center gap-2.5 text-base font-bold"
      aria-current={active ? 'step' : undefined}
    >
      <StepNumber step={step} active={active} />
      {children}
      {active && <span className="sr-only">{t('checkout.steps.now')}</span>}
    </h2>
  );
}

/** The commission of a direct-sale line; below its full amount the seller's fee cap is reached. */
function DirectCommission({ full, taken = full }: { full: number; taken?: number }) {
  const { t } = useTranslation('organizer');
  const capped = taken < full;
  return (
    <span
      className={cn(
        'whitespace-nowrap text-xs tabular-nums',
        capped ? 'text-success-soft-foreground' : 'text-muted-foreground'
      )}
      data-testid="checkout-commission"
    >
      {capped && taken === 0
        ? t('checkout.direct.capReached')
        : t(capped ? 'checkout.direct.commissionCapped' : 'checkout.direct.commission', {
            amount: formatPrice(taken),
          })}
    </span>
  );
}

/** One scanned item: live data (offline: the copy on the device), price choice and its problems. */
function CartLine({
  eventId,
  entry,
  offline,
  snapshot,
  directSale,
  commissionPercent,
  commission,
  onChange,
  onRemove,
  onResolved,
}: {
  eventId: Id<'events'>;
  entry: CartEntry;
  offline: boolean;
  snapshot: CheckoutSnapshot | null;
  /** The buyer paid the seller: the desk enters the agreed price, takes the commission */
  directSale: boolean;
  commissionPercent: number;
  /** What the desk takes for it at a direct sale, after the seller's fee cap */
  commission?: number;
  onChange: (change: Partial<CartEntry>) => void;
  onRemove: () => void;
  onResolved: (productId: Id<'products'>, line: ResolvedLine | undefined) => void;
}) {
  const { t } = useTranslation('organizer');
  const liveItem = useQuery(
    api.purchases.getCheckoutItem,
    offline ? 'skip' : { eventId, productId: entry.productId }
  );
  const liveOffers = useQuery(
    api.offers.getAcceptedOffersForEventProduct,
    !offline && liveItem ? { eventProductId: liveItem.eventProductId } : 'skip'
  );
  const offlineItem = offline ? lookupOffline(snapshot, entry.productId) : undefined;
  const item = offline ? offlineItem : liveItem;
  const offers = offline ? offlineItem?.offers : liveOffers;

  const negotiated = Number(entry.negotiatedInput.replace(',', '.'));
  const line = useMemo<ResolvedLine | undefined>(() => {
    if (offline && !snapshot) return { ok: false, problem: t('checkout.problem.noOfflineCopy') };
    if (item === undefined) return undefined;
    if (item === null) return { ok: false, problem: t('checkout.problem.otherEvent') };
    if (item.sellerPaidOut) return { ok: false, problem: t('checkout.problem.sellerPaid') };
    if (item.status === 'sold') return { ok: false, problem: t('checkout.problem.sold') };
    if (item.status !== 'available') {
      return { ok: false, problem: t('checkout.problem.notAccepted') };
    }
    const request = { eventProductId: item.eventProductId };
    const sale = {
      title: item.title,
      productId: entry.productId,
      sellerId: item.sellerId,
      feeCapLeft: item.feeCapLeft,
      commissionPercent: item.commissionPercent,
      invoice: {
        description: item.attributes
          .map((a) => `${categoryFieldText(a, 'label') ?? a.label}: ${a.value}`)
          .join(', '),
        image: item.image ?? undefined,
        price: item.price,
        discountPercent: item.discountPercent ?? undefined,
      },
    };
    if (entry.choice === 'negotiated') {
      // At a direct sale any price up to the label counts, seller and buyer agreed on it
      const min = directSale ? 0.01 : item.minimumPrice;
      if (min === undefined) return { ok: false, problem: t('checkout.problem.noNegotiation') };
      if (!Number.isFinite(negotiated) || negotiated < min || negotiated > item.listPrice) {
        return {
          ok: false,
          problem: t('checkout.problem.priceRange', {
            min: formatPrice(min),
            max: formatPrice(item.listPrice),
          }),
        };
      }
      const price = Math.round(negotiated * 100) / 100;
      return {
        ok: true,
        price,
        ...sale,
        source: 'negotiated',
        request: { ...request, negotiatedPrice: price },
      };
    }
    if (entry.choice !== 'list') {
      const offer = offers?.find((candidate) => candidate._id === entry.choice);
      if (!offer) return { ok: false, problem: t('checkout.problem.offerGone') };
      return {
        ok: true,
        price: Math.min(offer.amount, item.listPrice),
        ...sale,
        source: 'offer',
        request: { ...request, offerId: offer._id },
      };
    }
    return { ok: true, price: item.listPrice, ...sale, source: 'list', request };
  }, [item, offers, entry.choice, entry.productId, negotiated, offline, snapshot, directSale, t]);

  useEffect(() => onResolved(entry.productId, line), [entry.productId, line, onResolved]);

  const hasOptions =
    !!item && (directSale || (offers?.length ?? 0) > 0 || item.minimumPrice !== undefined);

  return (
    <li className="flex gap-3 p-3" data-testid="checkout-line">
      <Link
        to={`/products/view/${entry.productId}`}
        className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted transition-opacity hover:opacity-80"
        aria-label={item ? item.title : t('checkout.details')}
      >
        {item && (
          <ImageWithFallback
            storageId={item.image ?? undefined}
            alt=""
            className="h-full w-full object-cover"
          />
        )}
      </Link>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {item === undefined ? (
              <Skeleton className="my-0.5 h-5 w-40 max-w-full" />
            ) : (
              <p className="line-clamp-2 break-words font-medium">
                <Link
                  to={`/products/view/${entry.productId}`}
                  className="text-foreground hover:underline"
                >
                  {item ? item.title : t('checkout.unknown')}
                </Link>
              </p>
            )}
            {item && item.attributes.length > 0 && (
              <ul className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                {item.attributes.map((attribute) => (
                  <li key={attribute.label} className="[overflow-wrap:anywhere]">
                    {categoryFieldText(attribute, 'label') ?? attribute.label}: {attribute.value}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {line?.ok && (
              <span className="flex flex-col items-end">
                <span className="whitespace-nowrap font-semibold tabular-nums">
                  {formatPrice(line.price)} €
                </span>
                {directSale && (
                  <DirectCommission
                    full={commissionOf(line.price, line.commissionPercent ?? commissionPercent)}
                    taken={commission}
                  />
                )}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onRemove}
              aria-label={t('checkout.remove')}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {item?.internalNote && (
          <p className="flex items-start gap-1 text-sm text-warning-soft-foreground">
            <StickyNote className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0 break-words">{item.internalNote}</span>
          </p>
        )}

        {item?.discountPercent ? (
          // The discount as a yellow tag, as on the product page and the cards
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="line-through tabular-nums">{formatPrice(item.price)} €</span>
            <span className="rounded-md bg-tag px-1.5 py-0.5 font-bold text-tag-foreground">
              −{item.discountPercent} %
            </span>
          </p>
        ) : null}

        {hasOptions && item && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select
              className="min-w-0 max-w-full rounded-md border bg-background px-2 py-1"
              value={entry.choice}
              aria-label={t('checkout.price')}
              onChange={(e) => onChange({ choice: e.target.value as PriceChoice })}
            >
              <option value="list">
                {t('checkout.labelPrice', { price: formatPrice(item.listPrice) })}
              </option>
              {offers?.map((offer) => (
                <option key={offer._id} value={offer._id}>
                  {t('checkout.offer', {
                    name: offer.buyerName,
                    price: formatPrice(Math.min(offer.amount, item.listPrice)),
                  })}
                </option>
              ))}
              {directSale ? (
                <option value="negotiated">{t('checkout.direct.agreed')}</option>
              ) : (
                item.minimumPrice !== undefined && (
                  <option value="negotiated">
                    {t('checkout.negotiated', { min: formatPrice(item.minimumPrice) })}
                  </option>
                )
              )}
            </select>
            {entry.choice === 'negotiated' && (
              <Input
                className="h-8 w-28"
                inputMode="decimal"
                value={entry.negotiatedInput}
                onChange={(e) => onChange({ negotiatedInput: e.target.value })}
                aria-label={
                  directSale ? t('checkout.direct.agreedPrice') : t('checkout.negotiatedPrice')
                }
                placeholder={t('checkout.price')}
              />
            )}
          </div>
        )}

        {line && !line.ok && (
          <p className="flex items-center gap-1 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {line.problem}
          </p>
        )}
      </div>
    </li>
  );
}
