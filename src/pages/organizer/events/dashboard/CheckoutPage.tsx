import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  Keyboard,
  ShoppingCart,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { EMAIL_PATTERN } from '../../../../../convex/constants';
import { Button } from '../../../../components/ui/button';
import { Checkbox } from '../../../../components/ui/checkbox';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { ImageWithFallback } from '../../../../components/ui/image-with-fallback';
import { QRCodeScanner } from '../../../../components/ui/QRCodeScanner';
import { getUserFacingErrorMessage } from '../../../../lib/errors';
import { formatPriceDE } from '../../../../lib/utils';
import {
  clearCachedCart,
  getCheckoutSoundEnabled,
  loadCachedCart,
  playScanBeep,
  productIdFromCode,
  saveCachedCart,
  setCheckoutSoundEnabled,
  type CartEntry,
  type PriceChoice,
} from '../../../../lib/checkout';

/** The same code stays in front of the camera for a moment: ignore repeats meanwhile. */
const REPEAT_SCAN_MS = 2500;

/** What a cart line resolved to: ready to sell with a price, or a problem to fix. */
export type ResolvedLine =
  | {
      ok: true;
      price: number;
      request: {
        eventProductId: Id<'eventProducts'>;
        offerId?: Id<'productOffers'>;
        negotiatedPrice?: number;
      };
    }
  | { ok: false; problem: string };

/**
 * Cash desk with a cart: scan every item of a buyer, check the total, take the money,
 * sell everything in one go. Each line is a live query, so a sale at another desk or a
 * changed discount shows up right away.
 */
export function CheckoutPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const sellProducts = useMutation(api.purchases.sellProducts);
  const [cart, setCart] = useState<CartEntry[]>(() => (eventId ? loadCachedCart(eventId) : []));
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => getCheckoutSoundEnabled());
  const [resolved, setResolved] = useState<Record<string, ResolvedLine | undefined>>({});
  const [manualCode, setManualCode] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSale, setLastSale] = useState<{ count: number; total: number } | null>(null);
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

  const addCode = useCallback(
    (code: string) => {
      const now = Date.now();
      if (lastScan.current?.code === code && now - lastScan.current.at < REPEAT_SCAN_MS) return;
      lastScan.current = { code, at: now };

      const productId = productIdFromCode(code);
      if (!productId) {
        toast.error('Das ist kein Artikel-Etikett.');
        return;
      }
      if (cartRef.current.some((entry) => entry.productId === productId)) {
        toast.info('Der Artikel liegt schon im Warenkorb.');
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
    [setCart]
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

  // A changed cart or total needs a new confirmation of the money received
  useEffect(() => setPaymentConfirmed(false), [cart.length, total]);

  const submit = async () => {
    const requests = lines.flatMap((line) => (line?.ok ? [line.request] : []));
    setIsSubmitting(true);
    try {
      const result = await sellProducts({
        items: requests,
        buyerEmail: buyerEmail.trim() || undefined,
      });
      setLastSale({ count: result.purchaseIds.length, total: result.total });
      if (buyerEmail.trim()) toast.success('Beleg wird per E-Mail verschickt');
      setCart([]);
      setResolved({});
      setBuyerEmail('');
      if (eventId) clearCachedCart(eventId);
      codeInput.current?.focus();
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!eventId) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Kasse</h1>
        <p className="mt-1 text-muted-foreground">
          Alle Artikel eines Käufers scannen, Summe kassieren, einmal abschließen.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
        <section className="space-y-4 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Scanner</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={toggleSound}
              className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
              aria-label={soundEnabled ? 'Signalton ausschalten' : 'Signalton einschalten'}
            >
              {soundEnabled ? (
                <>
                  <Volume2 className="h-4 w-4 text-primary" />
                  <span>Ton an</span>
                </>
              ) : (
                <>
                  <VolumeX className="h-4 w-4" />
                  <span>Ton aus</span>
                </>
              )}
            </Button>
          </div>
          <QRCodeScanner onScanSuccess={addCode} />
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
              placeholder="Code eingeben oder Scanner"
              aria-label="Artikel-Code"
            />
            <Button type="submit" variant="outline" size="icon" aria-label="Hinzufügen">
              <Keyboard className="h-4 w-4" />
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">
            Ein Hand-Scanner tippt den Code wie eine Tastatur ins Feld.
          </p>
        </section>

        <section className="space-y-4">
          {lastSale && cart.length === 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <p>
                <b>{lastSale.count} Artikel verkauft</b> für {formatPriceDE(lastSale.total)} €. Der
                nächste Käufer kann kommen.
              </p>
            </div>
          )}

          {cart.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center text-muted-foreground">
              <ShoppingCart className="h-8 w-8" />
              <p>Der Warenkorb ist leer. Scanne das erste Etikett.</p>
            </div>
          ) : (
            <ul className="divide-y rounded-xl border bg-card">
              {cart.map((entry) => (
                <CartLine
                  key={entry.productId}
                  eventId={eventId as Id<'events'>}
                  entry={entry}
                  onChange={(change) => updateEntry(entry.productId, change)}
                  onRemove={() => removeEntry(entry.productId)}
                  onResolved={onResolved}
                />
              ))}
            </ul>
          )}

          {cart.length > 0 && (
            <div className="space-y-4 rounded-xl border bg-card p-4">
              <div className="flex items-baseline justify-between text-lg">
                <span>
                  Summe ({cart.length} {cart.length === 1 ? 'Artikel' : 'Artikel'})
                </span>
                <span className="text-2xl font-bold tabular-nums">{formatPriceDE(total)} €</span>
              </div>
              <div className="space-y-1">
                <Label htmlFor="checkout-email">Beleg per E-Mail (optional)</Label>
                <Input
                  id="checkout-email"
                  type="email"
                  value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                  placeholder="kaeufer@example.org"
                />
                {!emailValid && (
                  <p className="text-xs text-destructive">Bitte eine gültige E-Mail-Adresse.</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="checkout-paid"
                  checked={paymentConfirmed}
                  disabled={!allReady}
                  onCheckedChange={(checked) => setPaymentConfirmed(!!checked)}
                />
                <Label htmlFor="checkout-paid" className="cursor-pointer">
                  {formatPriceDE(total)} € erhalten
                </Label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="lg"
                  className="flex-1"
                  disabled={!allReady || !paymentConfirmed || !emailValid || isSubmitting}
                  onClick={submit}
                >
                  {isSubmitting ? 'Wird verkauft…' : 'Verkauf abschließen'}
                </Button>
                <Button size="lg" variant="outline" onClick={clearCart} disabled={isSubmitting}>
                  Leeren
                </Button>
              </div>
              {!allReady && lines.some((line) => line && !line.ok) && (
                <p className="flex items-center gap-2 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  Entferne die markierten Artikel, um abzuschließen.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** One scanned item: live data, price choice and its problems. */
function CartLine({
  eventId,
  entry,
  onChange,
  onRemove,
  onResolved,
}: {
  eventId: Id<'events'>;
  entry: CartEntry;
  onChange: (change: Partial<CartEntry>) => void;
  onRemove: () => void;
  onResolved: (productId: Id<'products'>, line: ResolvedLine | undefined) => void;
}) {
  const item = useQuery(api.purchases.getCheckoutItem, { eventId, productId: entry.productId });
  const offers = useQuery(
    api.offers.getAcceptedOffersForEventProduct,
    item ? { eventProductId: item.eventProductId } : 'skip'
  );

  const negotiated = Number(entry.negotiatedInput.replace(',', '.'));
  const line = useMemo<ResolvedLine | undefined>(() => {
    if (item === undefined) return undefined;
    if (item === null) return { ok: false, problem: 'Gehört nicht zu diesem Basar.' };
    if (item.sellerPaidOut) return { ok: false, problem: 'Verkäufer ist bereits abgerechnet.' };
    if (item.status === 'sold') return { ok: false, problem: 'Bereits verkauft.' };
    if (item.status !== 'available') {
      return { ok: false, problem: 'Nicht angenommen – erst an der Annahme einscannen.' };
    }
    const request = { eventProductId: item.eventProductId };
    if (entry.choice === 'negotiated') {
      const min = item.minimumPrice;
      if (min === undefined) return { ok: false, problem: 'Kein Verhandlungspreis möglich.' };
      if (!Number.isFinite(negotiated) || negotiated < min || negotiated > item.listPrice) {
        return {
          ok: false,
          problem: `Preis zwischen ${formatPriceDE(min)} € und ${formatPriceDE(item.listPrice)} € eingeben.`,
        };
      }
      const price = Math.round(negotiated * 100) / 100;
      return { ok: true, price, request: { ...request, negotiatedPrice: price } };
    }
    if (entry.choice !== 'list') {
      const offer = offers?.find((candidate) => candidate._id === entry.choice);
      if (!offer) return { ok: false, problem: 'Der Preisvorschlag gilt nicht mehr.' };
      return {
        ok: true,
        price: Math.min(offer.amount, item.listPrice),
        request: { ...request, offerId: offer._id },
      };
    }
    return { ok: true, price: item.listPrice, request };
  }, [item, offers, entry.choice, negotiated]);

  useEffect(() => onResolved(entry.productId, line), [entry.productId, line, onResolved]);

  const hasOptions = !!item && ((offers?.length ?? 0) > 0 || item.minimumPrice !== undefined);

  return (
    <li className="flex gap-3 p-3" data-testid="checkout-line">
      <Link
        to={`/products/view/${entry.productId}`}
        className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted transition-opacity hover:opacity-80"
        aria-label={item ? item.title : 'Artikeldetails'}
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
            <p className="truncate font-medium">
              <Link
                to={`/products/view/${entry.productId}`}
                className="text-foreground hover:underline"
              >
                {item ? item.title : item === null ? 'Unbekannter Artikel' : 'Lädt…'}
              </Link>
            </p>
            {item && item.attributes.length > 0 && (
              <p className="truncate text-xs text-muted-foreground">
                {item.attributes
                  .map((attribute) => `${attribute.label}: ${attribute.value}`)
                  .join(' · ')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {line?.ok && (
              <span className="whitespace-nowrap font-semibold tabular-nums">
                {formatPriceDE(line.price)} €
              </span>
            )}
            <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Aus dem Warenkorb">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {item?.discountPercent ? (
          <p className="text-xs text-muted-foreground">
            <span className="line-through">{formatPriceDE(item.price)} €</span> −
            {item.discountPercent} %
          </p>
        ) : null}

        {hasOptions && item && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select
              className="rounded-md border bg-background px-2 py-1"
              value={entry.choice}
              aria-label="Preis"
              onChange={(e) => onChange({ choice: e.target.value as PriceChoice })}
            >
              <option value="list">Etikettpreis {formatPriceDE(item.listPrice)} €</option>
              {offers?.map((offer) => (
                <option key={offer._id} value={offer._id}>
                  Vorschlag {offer.buyerName}:{' '}
                  {formatPriceDE(Math.min(offer.amount, item.listPrice))} €
                </option>
              ))}
              {item.minimumPrice !== undefined && (
                <option value="negotiated">
                  Verhandelt (ab {formatPriceDE(item.minimumPrice)} €)
                </option>
              )}
            </select>
            {entry.choice === 'negotiated' && (
              <Input
                className="h-8 w-28"
                inputMode="decimal"
                value={entry.negotiatedInput}
                onChange={(e) => onChange({ negotiatedInput: e.target.value })}
                aria-label="Verhandelter Preis"
                placeholder="Preis"
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
