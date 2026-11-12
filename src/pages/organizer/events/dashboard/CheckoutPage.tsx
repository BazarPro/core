import { PageHeader } from '../../../../components/ui/page-header';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApiClient, useMutation, useQuery } from '../../../../lib/api/react';
import { isNetworkError } from '../../../../lib/offlineMode';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Banknote,
  Camera,
  CameraOff,
  CheckCircle2,
  CreditCard,
  Download,
  Keyboard,
  ShoppingCart,
  StickyNote,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { api } from '../../../../lib/api/functions';
import type { Id, PaymentMethod } from '../../../../lib/api/types';
import { EMAIL_PATTERN } from '../../../../shared/constants';
import { resolveEventFeatures } from '../../../../shared/eventFeatures';
import { Button } from '../../../../components/ui/button';
import { StickyActionBar } from '../../../../components/ui/sticky-action-bar';
import { Checkbox } from '../../../../components/ui/checkbox';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { ImageWithFallback } from '../../../../components/ui/image-with-fallback';
import { QRCodeScanner } from '../../../../components/ui/QRCodeScanner';
import { getUserFacingErrorMessage } from '../../../../lib/errors';
import { formatPriceDE } from '../../../../lib/utils';
import { Trans, useTranslation } from 'react-i18next';
import { useEventAccess } from '../../../../hooks/useEventAccess';
import { PageSkeleton } from '../../../../components/ui/loading';
import {
  clearCachedCart,
  getCheckoutCameraEnabled,
  getCheckoutSoundEnabled,
  loadCachedCart,
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
import { SumUpPanel, SumUpUnclearDialog } from './components/SumUpPanel';
import { SUMUP_MIN_AMOUNT, useSumUp, type SumUpOutcome } from '../../../../native/sumup';
import { useOfflinePreparation } from '../../../../lib/offlinePrefetch';
import { downloadPrivateInvoicesForSale } from '../../../../lib/privateInvoice';
import { provisionalSale } from '../../../../lib/saleBreakdown';

/** The same code stays in front of the camera for a moment: ignore repeats meanwhile. */
const REPEAT_SCAN_MS = 2500;

/** What a cart line resolved to: ready to sell with a price, or a problem to fix. */
export type ResolvedLine =
  | {
      ok: true;
      price: number;
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
export function CheckoutPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { isLoading, can } = useEventAccess(eventId as Id<'events'>);
  if (isLoading) return <PageSkeleton />;
  if (!can('sale')) return <NoCashDesk eventId={eventId} />;
  return <CashDesk />;
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
    <div className="mx-auto max-w-5xl space-y-6">
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

/** Failures of a SumUp payment the desk explains itself; others show SumUp's text. */
const SUMUP_FAILURES = [
  'cancelled',
  'notLoggedIn',
  'permission',
  'noConnectivity',
  'tapToPayActivation',
] as const;

/**
 * Cash desk with a cart: scan every item of a buyer, check the total, take the money,
 * sell everything in one go. Each line is a live query, so a sale at another desk or a
 * changed discount shows up right away. Without internet the app sells from its copy of
 * the items and books the sales later (lib/offlineCheckout.ts).
 */
function CashDesk() {
  const { t } = useTranslation('organizer');
  const { eventId } = useParams<{ eventId: string }>();
  const sellProducts = useMutation(api.purchases.sellProducts);
  const client = useApiClient();
  const [cart, setCart] = useState<CartEntry[]>(() => (eventId ? loadCachedCart(eventId) : []));
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => getCheckoutSoundEnabled());
  const [cameraOn, setCameraOn] = useState<boolean>(() => getCheckoutCameraEnabled());
  const [resolved, setResolved] = useState<Record<string, ResolvedLine | undefined>>({});
  const [manualCode, setManualCode] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSale, setLastSale] = useState<{
    count: number;
    total: number;
    /** Kept on the device, booked once online */
    queued: boolean;
    card: boolean;
    lines: Extract<ResolvedLine, { ok: true }>[];
  } | null>(null);
  // Product pages and seller IDs too, for a look at an item without internet
  const event = useQuery(api.events.getEvent, eventId ? { id: eventId as Id<'events'> } : 'skip');
  useOfflinePreparation(eventId, event, true);
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
  const emailValid = buyerEmail.trim() === '' || EMAIL_PATTERN.test(buyerEmail.trim());
  // Card payments run over the organizer's own terminal; the desk records how it was paid
  const cardPayments = !!event && resolveEventFeatures(event).cardPayments;
  const [chosenMethod, setChosenMethod] = useState<PaymentMethod>('cash');
  const paymentMethod: PaymentMethod = cardPayments ? chosenMethod : 'cash';
  const byCard = paymentMethod === 'card';
  const saleKey = `${cart.map((entry) => entry.productId).join()}:${total}:${paymentMethod}`;
  const moneyReceived = paidFor === saleKey;
  // In the app with a SumUp login the desk charges the card itself and books afterwards;
  // the confirmation of the terminal takes the place of the tick "received"
  const sumUp = useSumUp(cardPayments);
  // Offline SumUp cannot charge; the desk records a card payment by hand as before
  const viaSumUp = byCard && sumUp.available && sumUp.loggedIn === true && !offline.offline;
  const belowSumUpMinimum = viaSumUp && total < SUMUP_MIN_AMOUNT;
  /** A card payment SumUp could not confirm; the cashier says whether it went through */
  const [unclear, setUnclear] = useState<{
    deskSaleId: string;
    ready: Extract<ResolvedLine, { ok: true }>[];
    total: number;
  } | null>(null);
  const [bookingUnclear, setBookingUnclear] = useState(false);

  // Wakes the reader with the first item, so the payment starts without waiting
  const { prepare: prepareSumUp } = sumUp;
  const hasItems = cart.length > 0;
  useEffect(() => {
    if (viaSumUp && hasItems) prepareSumUp();
  }, [viaSumUp, hasItems, prepareSumUp]);

  const nextBuyer = () => {
    setCart([]);
    setResolved({});
    setBuyerEmail('');
    setChosenMethod('cash');
    if (eventId) clearCachedCart(eventId);
    codeInput.current?.focus();
  };

  /**
   * Keeps the sale on the device; the money is taken, so it is done for the buyer.
   * `sumUp`: charged with SumUp, with its transaction code if it gave one.
   */
  const queueSale = async (
    deskSaleId: string,
    ready: Extract<ResolvedLine, { ok: true }>[],
    sumUp?: { transactionCode?: string }
  ) => {
    const card = byCard || !!sumUp;
    const paid = ready.reduce((sum, line) => sum + line.price, 0);
    await enqueueSale(eventId!, {
      deskSaleId,
      soldAt: Date.now(),
      buyerEmail: buyerEmail.trim() || undefined,
      paymentMethod: card ? 'card' : undefined,
      cardTransactionCode: sumUp?.transactionCode,
      items: ready.map((line) => ({
        eventProductId: line.request.eventProductId,
        productId: line.productId,
        title: line.title,
        paid: line.price,
        priceSource: line.source,
        offerId: line.request.offerId,
      })),
    });
    setLastSale({ count: ready.length, total: paid, queued: true, card, lines: ready });
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
        // Left out for cash, which is what a backend from before card payments books
        paymentMethod: byCard ? 'card' : undefined,
      });
      setLastSale({
        count: result.purchaseIds.length,
        total: result.total,
        queued: false,
        card: byCard,
        lines: ready,
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

  /**
   * Books a cart SumUp has charged. The money is on the organizer's account, so the sale
   * must not get lost: whatever the backend refuses (an item sold at another desk in the
   * meantime) goes to the queue, which books the rest and leaves the refused items as
   * conflicts for the team, with SumUp's code for a refund.
   */
  const bookCardSale = async (
    deskSaleId: string,
    ready: Extract<ResolvedLine, { ok: true }>[],
    cardTransactionCode?: string
  ) => {
    try {
      const result = await sellProducts({
        items: ready.map((line) => line.request),
        buyerEmail: buyerEmail.trim() || undefined,
        deskSaleId,
        paymentMethod: 'card',
        cardTransactionCode,
      });
      setLastSale({
        count: result.purchaseIds.length,
        total: result.total,
        queued: false,
        card: true,
        lines: ready,
      });
      if (buyerEmail.trim()) toast.success(t('checkout.receiptSent'));
      nextBuyer();
    } catch (error) {
      try {
        await queueSale(deskSaleId, ready, { transactionCode: cardTransactionCode });
      } catch {
        // Not even on the device: the cashier has to note it, the card is charged
        toast.error(t('checkout.sumup.notSaved', { code: cardTransactionCode ?? deskSaleId }), {
          duration: Infinity,
        });
        return;
      }
      if (!isNetworkError(error)) {
        toast.warning(t('checkout.sumup.conflict', { error: getUserFacingErrorMessage(error) }), {
          duration: 15000,
        });
      }
    }
  };

  const failedPayment = (outcome: SumUpOutcome) => {
    const code = SUMUP_FAILURES.find((known) => known === outcome.code);
    toast.error(
      code
        ? t(`checkout.sumup.failed.${code}`)
        : outcome.message || t('checkout.sumup.failed.other')
    );
  };

  /** Charges the cart with SumUp, then books it. */
  const chargeWithSumUp = async () => {
    const ready = lines.flatMap((line) => (line?.ok ? [line] : []));
    // Also SumUp's foreign transaction ID: a payment can be found by its sale
    const deskSaleId = crypto.randomUUID();
    setIsSubmitting(true);
    try {
      const outcome = await sumUp.charge({
        total,
        foreignTransactionId: deskSaleId,
        title: event?.title,
      });
      if (outcome.status === 'successful') {
        await bookCardSale(deskSaleId, ready, outcome.transactionCode);
      } else if (outcome.status === 'unknown') {
        setUnclear({ deskSaleId, ready, total });
      } else {
        failedPayment(outcome);
      }
    } catch (error) {
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

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title={t('checkout.title')} />

      <OfflineCheckoutBanner {...offline} />
      {offline.refusedWith && offline.pending > 0 && (
        <OfflineQueueRefused
          message={offline.refusedWith}
          pending={t('checkout.offline.pending', { count: offline.pending })}
          retry={offline.retry}
        />
      )}

      {/* grid-cols-1: an implicit column would grow with the widest line on a phone */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
        <section className="space-y-4 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">{t('checkout.scanner')}</span>
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

        <section className="space-y-4">
          {lastSale && cart.length === 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <p className="min-w-0 flex-1 basis-48">
                <Trans
                  i18nKey={lastSale.queued ? 'checkout.offline.queued' : 'checkout.sold'}
                  ns="organizer"
                  count={lastSale.count}
                  values={{ total: formatPriceDE(lastSale.total) }}
                  components={{ b: <b /> }}
                />
                {lastSale.card && <> {t('checkout.paidByCard')}</>}
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
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center text-muted-foreground">
              <ShoppingCart className="h-8 w-8" />
              <p>{t('checkout.empty')}</p>
            </div>
          ) : (
            <ul className="divide-y rounded-xl border bg-card">
              {cart.map((entry) => (
                <CartLine
                  key={entry.productId}
                  eventId={eventId as Id<'events'>}
                  entry={entry}
                  offline={offline.offline}
                  snapshot={offline.snapshot}
                  onChange={(change) => updateEntry(entry.productId, change)}
                  onRemove={() => removeEntry(entry.productId)}
                  onResolved={onResolved}
                />
              ))}
            </ul>
          )}

          {cart.length > 0 && (
            <>
              <div className="space-y-1 rounded-xl border bg-card p-4">
                <Label htmlFor="checkout-email">{t('checkout.email')}</Label>
                <Input
                  id="checkout-email"
                  type="email"
                  value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                  placeholder={t('checkout.emailPlaceholder')}
                />
                {!emailValid && (
                  <p className="text-xs text-destructive">{t('checkout.emailInvalid')}</p>
                )}
              </div>
              {/* Sum and the way to finish stay in reach, however long the cart is */}
              <StickyActionBar className="lg:static lg:mx-0 lg:rounded-xl lg:border lg:bg-card lg:p-4 lg:backdrop-blur-none">
                <div className="flex w-full items-baseline justify-between">
                  <span>{t('checkout.sum', { count: cart.length })}</span>
                  <span className="text-2xl font-bold tabular-nums">{formatPriceDE(total)} €</span>
                </div>
                {cardPayments && (
                  <div className="w-full space-y-1">
                    <div
                      role="radiogroup"
                      aria-label={t('checkout.payment')}
                      className="grid w-full grid-cols-2 gap-2"
                    >
                      {(['cash', 'card'] as const).map((method) => (
                        <Button
                          key={method}
                          type="button"
                          role="radio"
                          aria-checked={paymentMethod === method}
                          variant={paymentMethod === method ? 'default' : 'outline'}
                          className="gap-2"
                          disabled={isSubmitting}
                          onClick={() => setChosenMethod(method)}
                        >
                          {method === 'cash' ? (
                            <Banknote className="h-4 w-4" />
                          ) : (
                            <CreditCard className="h-4 w-4" />
                          )}
                          {t(`checkout.${method}`)}
                        </Button>
                      ))}
                    </div>
                    {byCard && sumUp.available && (
                      <SumUpPanel sumUp={sumUp} disabled={isSubmitting} />
                    )}
                    {byCard && !viaSumUp && (
                      <p className="text-xs text-muted-foreground">{t('checkout.cardHint')}</p>
                    )}
                  </div>
                )}
                {/* A sale is only one tap away otherwise; a changed cart or method asks again.
                    SumUp confirms the payment itself, before the sale is booked */}
                {!viaSumUp && (
                  <Label
                    htmlFor="checkout-money-received"
                    className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg border bg-card px-3 py-2 text-base font-medium"
                  >
                    <Checkbox
                      id="checkout-money-received"
                      checked={moneyReceived}
                      disabled={!allReady || isSubmitting}
                      onCheckedChange={(checked) => setPaidFor(checked ? saleKey : null)}
                      className="size-5"
                    />
                    {t(byCard ? 'checkout.receivedCard' : 'checkout.received', {
                      total: formatPriceDE(total),
                    })}
                  </Label>
                )}
                {belowSumUpMinimum && (
                  <p className="text-xs text-destructive">
                    {t('checkout.sumup.minimum', { min: formatPriceDE(SUMUP_MIN_AMOUNT) })}
                  </p>
                )}
                <div className="flex w-full gap-2">
                  {viaSumUp ? (
                    <Button
                      loading={isSubmitting}
                      size="lg"
                      className="h-auto min-h-10 min-w-0 flex-1 gap-2 whitespace-normal"
                      disabled={
                        !allReady || !emailValid || belowSumUpMinimum || isSubmitting || sumUp.busy
                      }
                      onClick={() => void chargeWithSumUp()}
                    >
                      <CreditCard className="h-4 w-4 shrink-0" />
                      {isSubmitting
                        ? t('checkout.sumup.charging')
                        : t('checkout.sumup.charge', { total: formatPriceDE(total) })}
                    </Button>
                  ) : (
                    <Button
                      loading={isSubmitting}
                      size="lg"
                      className="h-auto min-h-10 min-w-0 flex-1 whitespace-normal"
                      disabled={!allReady || !emailValid || !moneyReceived || isSubmitting}
                      onClick={submit}
                    >
                      {isSubmitting ? t('checkout.selling') : t('checkout.complete')}
                    </Button>
                  )}
                  <Button size="lg" variant="outline" onClick={clearCart} disabled={isSubmitting}>
                    {t('checkout.clear')}
                  </Button>
                </div>
                {!allReady && lines.some((line) => line && !line.ok) && (
                  <p className="flex items-center gap-2 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    {t('checkout.removeMarked')}
                  </p>
                )}
              </StickyActionBar>
            </>
          )}
        </section>
      </div>
      <SumUpUnclearDialog
        open={unclear !== null}
        total={unclear?.total ?? 0}
        booking={bookingUnclear}
        onNotPaid={() => setUnclear(null)}
        onPaid={() => {
          if (!unclear) return;
          setBookingUnclear(true);
          void bookCardSale(unclear.deskSaleId, unclear.ready).finally(() => {
            setBookingUnclear(false);
            setUnclear(null);
          });
        }}
      />
    </div>
  );
}

/** One scanned item: live data (offline: the copy on the device), price choice and its problems. */
function CartLine({
  eventId,
  entry,
  offline,
  snapshot,
  onChange,
  onRemove,
  onResolved,
}: {
  eventId: Id<'events'>;
  entry: CartEntry;
  offline: boolean;
  snapshot: CheckoutSnapshot | null;
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
      invoice: {
        description: item.attributes.map((a) => `${a.label}: ${a.value}`).join(', '),
        image: item.image ?? undefined,
        price: item.price,
        discountPercent: item.discountPercent ?? undefined,
      },
    };
    if (entry.choice === 'negotiated') {
      const min = item.minimumPrice;
      if (min === undefined) return { ok: false, problem: t('checkout.problem.noNegotiation') };
      if (!Number.isFinite(negotiated) || negotiated < min || negotiated > item.listPrice) {
        return {
          ok: false,
          problem: t('checkout.problem.priceRange', {
            min: formatPriceDE(min),
            max: formatPriceDE(item.listPrice),
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
  }, [item, offers, entry.choice, entry.productId, negotiated, offline, snapshot, t]);

  useEffect(() => onResolved(entry.productId, line), [entry.productId, line, onResolved]);

  const hasOptions = !!item && ((offers?.length ?? 0) > 0 || item.minimumPrice !== undefined);

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
                    {attribute.label}: {attribute.value}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {line?.ok && (
              <span className="whitespace-nowrap font-semibold tabular-nums">
                {formatPriceDE(line.price)} €
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
          <p className="flex items-start gap-1 text-sm text-amber-700 dark:text-amber-300">
            <StickyNote className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0 break-words">{item.internalNote}</span>
          </p>
        )}

        {item?.discountPercent ? (
          <p className="text-xs text-muted-foreground">
            <span className="line-through">{formatPriceDE(item.price)} €</span> −
            {item.discountPercent} %
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
                {t('checkout.labelPrice', { price: formatPriceDE(item.listPrice) })}
              </option>
              {offers?.map((offer) => (
                <option key={offer._id} value={offer._id}>
                  {t('checkout.offer', {
                    name: offer.buyerName,
                    price: formatPriceDE(Math.min(offer.amount, item.listPrice)),
                  })}
                </option>
              ))}
              {item.minimumPrice !== undefined && (
                <option value="negotiated">
                  {t('checkout.negotiated', { min: formatPriceDE(item.minimumPrice) })}
                </option>
              )}
            </select>
            {entry.choice === 'negotiated' && (
              <Input
                className="h-8 w-28"
                inputMode="decimal"
                value={entry.negotiatedInput}
                onChange={(e) => onChange({ negotiatedInput: e.target.value })}
                aria-label={t('checkout.negotiatedPrice')}
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
