import { useState, useEffect } from 'react';
import { useQuery } from '../../lib/api/react';
import { api } from '../../lib/api/functions';
import type { Id } from '../../lib/api/types';
import { EMAIL_PATTERN } from '../../shared/constants';
import { discountedPrice } from '../../shared/eventFeatures';
import { Input } from '../ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { formatPriceDE } from '../../lib/utils';
import { CheckCircle2, Download, ShoppingCart } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

export interface SaleOptions {
  offerId?: Id<'productOffers'>;
  negotiatedPrice?: number;
  buyerEmail?: string;
  /** Amount the buyer pays, for the invoice download */
  finalPrice: number;
}

interface UnifiedSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productTitle: string;
  price: number;
  discountPercent?: number;
  /** Shows accepted online offers for this item, if any */
  eventProductId?: Id<'eventProducts'>;
  /** Seller's minimum price; only passed when the event allows negotiating */
  minimumPrice?: number;
  onConfirmSale: (options: SaleOptions) => Promise<boolean>;
  onDownloadInvoice: () => Promise<void>;
  isSubmitting: boolean;
}

type PriceChoice = 'list' | 'negotiated' | Id<'productOffers'>;

export function UnifiedSaleDialog({
  open,
  onOpenChange,
  productTitle,
  price,
  discountPercent,
  eventProductId,
  minimumPrice,
  onConfirmSale,
  onDownloadInvoice,
  isSubmitting,
}: UnifiedSaleDialogProps) {
  const { t } = useTranslation('organizer');
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [saleSuccess, setSaleSuccess] = useState(false);
  const [priceChoice, setPriceChoice] = useState<PriceChoice>('list');
  const [negotiatedInput, setNegotiatedInput] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');

  const acceptedOffers = useQuery(
    api.offers.getAcceptedOffersForEventProduct,
    open && eventProductId ? { eventProductId } : 'skip'
  );

  useEffect(() => {
    if (open) {
      setPaymentConfirmed(false);
      setSaleSuccess(false);
      setPriceChoice('list');
      setNegotiatedInput('');
      setBuyerEmail('');
    }
  }, [open]);

  const listPrice = discountedPrice(price, discountPercent);
  const discountAmount = price - listPrice;
  const selectedOffer = acceptedOffers?.find((offer) => offer._id === priceChoice);
  // A discount can push the label price down to the minimum: nothing left to negotiate
  const canNegotiate = minimumPrice !== undefined && minimumPrice < listPrice;
  const negotiatedPrice = Number(negotiatedInput.replace(',', '.'));
  const negotiatedValid =
    canNegotiate &&
    negotiatedInput !== '' &&
    Number.isFinite(negotiatedPrice) &&
    negotiatedPrice >= minimumPrice &&
    negotiatedPrice <= listPrice;
  const finalPrice = selectedOffer
    ? Math.min(selectedOffer.amount, listPrice)
    : priceChoice === 'negotiated' && negotiatedValid
      ? negotiatedPrice
      : listPrice;
  const emailValid = buyerEmail.trim() === '' || EMAIL_PATTERN.test(buyerEmail.trim());
  const canSubmit =
    paymentConfirmed && emailValid && (priceChoice !== 'negotiated' || negotiatedValid);
  const hasPriceOptions = (acceptedOffers?.length ?? 0) > 0 || canNegotiate;

  // Changing the price invalidates an already ticked "amount received"
  useEffect(() => setPaymentConfirmed(false), [priceChoice, negotiatedInput]);

  const handleSale = async () => {
    if (!canSubmit) return;
    const success = await onConfirmSale({
      offerId: selectedOffer?._id,
      negotiatedPrice: priceChoice === 'negotiated' ? negotiatedPrice : undefined,
      buyerEmail: buyerEmail.trim() || undefined,
      finalPrice,
    });
    if (success) {
      setSaleSuccess(true);
    }
  };

  if (saleSuccess) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px] text-center py-10">
          <div className="flex justify-center mb-4">
            <div className="bg-green-100 p-3 rounded-full dark:bg-green-900/30">
              <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <DialogHeader>
            <DialogTitle className="text-center text-2xl font-bold">{t('sale.done')}</DialogTitle>
            <DialogDescription className="text-center text-base">
              <Trans
                i18nKey="sale.doneText"
                ns="organizer"
                values={{ title: productTitle }}
                components={{ b: <b /> }}
              />
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 space-y-4">
            <p className="text-sm text-muted-foreground">{t('sale.invoiceQuestion')}</p>
            <Button onClick={onDownloadInvoice} className="w-full gap-2" variant="outline">
              <Download className="h-4 w-4" />
              {t('sale.invoice')}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} className="w-full">
              {t('sale.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            {t('sale.title')}
          </DialogTitle>
          <DialogDescription>{t('sale.text')}</DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-6">
          <div className="bg-muted p-4 rounded-lg space-y-3">
            <div className="flex justify-between text-sm items-center">
              <span className="text-muted-foreground">{t('sale.item')}</span>
              <span className="font-medium truncate max-w-[200px]" title={productTitle}>
                {productTitle}
              </span>
            </div>

            {discountPercent && discountPercent > 0 ? (
              <>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-muted-foreground">{t('sale.originalPrice')}</span>
                  <span>{formatPriceDE(price)} €</span>
                </div>
                <div className="flex justify-between text-sm items-center text-destructive">
                  <span className="text-muted-foreground text-destructive">
                    {t('sale.discount', { percent: discountPercent })}
                  </span>
                  <span>-{formatPriceDE(discountAmount)} €</span>
                </div>
              </>
            ) : null}

            {hasPriceOptions && (
              <div
                className="pt-2 border-t space-y-2"
                role="radiogroup"
                aria-label={t('sale.price')}
              >
                <PriceOption
                  checked={priceChoice === 'list'}
                  onSelect={() => setPriceChoice('list')}
                  label={t('sale.labelPrice')}
                  amount={listPrice}
                />
                {acceptedOffers?.map((offer) => (
                  <PriceOption
                    key={offer._id}
                    checked={priceChoice === offer._id}
                    onSelect={() => setPriceChoice(offer._id)}
                    label={t('sale.acceptedOffer', { name: offer.buyerName })}
                    amount={Math.min(offer.amount, listPrice)}
                  />
                ))}
                {canNegotiate && (
                  <>
                    <PriceOption
                      checked={priceChoice === 'negotiated'}
                      onSelect={() => setPriceChoice('negotiated')}
                      label={t('sale.negotiated', { min: formatPriceDE(minimumPrice) })}
                    />
                    {priceChoice === 'negotiated' && (
                      <div className="pl-6 space-y-1">
                        <Input
                          inputMode="decimal"
                          autoFocus
                          placeholder={`${formatPriceDE(minimumPrice)} – ${formatPriceDE(listPrice)}`}
                          value={negotiatedInput}
                          onChange={(e) => setNegotiatedInput(e.target.value)}
                          aria-label={t('sale.negotiatedPrice')}
                        />
                        {negotiatedInput !== '' && !negotiatedValid && (
                          <p className="text-xs text-destructive">
                            {t('sale.allowed', {
                              min: formatPriceDE(minimumPrice),
                              max: formatPriceDE(listPrice),
                            })}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="pt-2 border-t flex justify-between items-center">
              <span className="text-lg font-bold">{t('sale.toCollect')}</span>
              <span className="text-2xl font-black text-primary">
                {formatPriceDE(finalPrice)} €
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="buyer-email">{t('sale.receiptEmail')}</Label>
            <Input
              id="buyer-email"
              type="email"
              placeholder={t('sale.emailPlaceholder')}
              value={buyerEmail}
              onChange={(e) => setBuyerEmail(e.target.value)}
            />
            {!emailValid && <p className="text-xs text-destructive">{t('sale.emailInvalid')}</p>}
            <p className="text-xs text-muted-foreground">{t('sale.emailHint')}</p>
          </div>

          <div
            className={`flex items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm cursor-pointer transition-colors ${paymentConfirmed ? 'bg-primary/5 border-primary/50' : 'bg-background'}`}
            onClick={() => setPaymentConfirmed(!paymentConfirmed)}
          >
            <Checkbox
              id="payment-confirm"
              checked={paymentConfirmed}
              onCheckedChange={(checked: boolean | string) => setPaymentConfirmed(!!checked)}
            />
            <div className="grid gap-1.5 leading-none cursor-pointer">
              <Label
                htmlFor="payment-confirm"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                {t('sale.received', { amount: formatPriceDE(finalPrice) })}
              </Label>
              <p className="text-xs text-muted-foreground">{t('sale.receivedHint')}</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('actions.cancel', { ns: 'common' })}
          </Button>
          <Button
            loading={isSubmitting}
            onClick={handleSale}
            disabled={!canSubmit || isSubmitting}
            className="gap-2"
          >
            {isSubmitting ? t('sale.saving') : t('sale.finish')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PriceOption({
  checked,
  onSelect,
  label,
  amount,
}: {
  checked: boolean;
  onSelect: () => void;
  label: string;
  amount?: number;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className="flex w-full items-center justify-between gap-2 text-left text-sm"
    >
      <span className="flex items-center gap-2">
        <span
          className={`h-4 w-4 shrink-0 rounded-full border-2 bg-background ${checked ? 'border-primary border-[5px]' : 'border-muted-foreground/60'}`}
        />
        {label}
      </span>
      {amount !== undefined && (
        <span className="font-medium whitespace-nowrap">{formatPriceDE(amount)} €</span>
      )}
    </button>
  );
}
