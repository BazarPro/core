import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQuery } from '../../../../lib/api/react';
import { toast } from 'sonner';
import { HandCoins } from 'lucide-react';
import { api } from '../../../../lib/api/functions';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Textarea } from '../../../../components/ui/text-area';
import { Badge } from '../../../../components/ui/badge';
import { formatPriceDE } from '../../../../lib/utils';
import { getUserFacingErrorMessage } from '../../../../lib/errors';
import { loginPath } from '../../../../lib/loginRedirect';
import { Trans, useTranslation } from 'react-i18next';

interface PublicProductOfferProps {
  productId: Id<'products'>;
  currentPrice: number;
  eventTitle: string;
  isLoggedIn: boolean;
}

const STATUS_VARIANT = {
  pending: 'secondary',
  accepted: 'default',
  rejected: 'destructive',
  withdrawn: 'outline',
  redeemed: 'default',
} as const;

/** Buyer side of online price offers: send, update or withdraw an offer. */
export function PublicProductOffer({
  productId,
  currentPrice,
  eventTitle,
  isLoggedIn,
}: PublicProductOfferProps) {
  const { t } = useTranslation('product');
  const location = useLocation();
  const myOffer = useQuery(api.offers.getMyOfferForProduct, isLoggedIn ? { productId } : 'skip');
  const makeOffer = useMutation(api.offers.makeOffer);
  const withdrawOffer = useMutation(api.offers.withdrawOffer);
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const submit = async () => {
    const value = Number(amount.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      toast.error(t('offer.invalidAmount'));
      return;
    }
    setIsSaving(true);
    try {
      await makeOffer({ productId, amount: value, message: message || undefined });
      toast.success(t('offer.sent'));
      setShowForm(false);
      setAmount('');
      setMessage('');
    } catch (error) {
      toast.error(t('offer.sendFailed'), {
        description: getUserFacingErrorMessage(error),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const withdraw = async () => {
    if (!myOffer) return;
    try {
      await withdrawOffer({ offerId: myOffer._id });
      toast.success(t('offer.withdrawnToast'));
    } catch (error) {
      toast.error(t('offer.error'), { description: getUserFacingErrorMessage(error) });
    }
  };

  const isOpen = myOffer?.status === 'pending' || myOffer?.status === 'accepted';
  const canOfferAgain = !myOffer || myOffer.status === 'rejected' || myOffer.status === 'withdrawn';

  return (
    <div className="space-y-3 border-t pt-5">
      <div className="flex items-center gap-2">
        <HandCoins className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">{t('offer.title')}</h3>
      </div>

      {!isLoggedIn ? (
        <p className="text-sm text-muted-foreground">
          <Trans
            i18nKey="offer.loginToOffer"
            ns="product"
            components={{
              login: (
                <Link
                  to={loginPath(location.pathname + location.search)}
                  className="text-primary underline"
                />
              ),
            }}
          />
        </p>
      ) : (
        <>
          {myOffer && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted p-3">
              <div className="text-sm">
                <Trans
                  i18nKey="offer.yours"
                  ns="product"
                  values={{ amount: formatPriceDE(myOffer.amount) }}
                  components={{ b: <b /> }}
                />
              </div>
              <Badge variant={STATUS_VARIANT[myOffer.status]}>{t(`offer.${myOffer.status}`)}</Badge>
            </div>
          )}
          {myOffer?.status === 'accepted' && (
            <p className="text-sm text-muted-foreground">
              {t('offer.payOnSite', { event: eventTitle })}
            </p>
          )}

          {(showForm || (canOfferAgain && !myOffer)) && myOffer?.status !== 'accepted' ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="offer-amount">
                  {t('offer.yourPrice', { price: formatPriceDE(currentPrice) })}
                </Label>
                <Input
                  id="offer-amount"
                  inputMode="decimal"
                  placeholder={t('offer.placeholder')}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="offer-message">{t('offer.message')}</Label>
                <Textarea
                  id="offer-message"
                  maxLength={300}
                  rows={2}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
              <Button className="w-full" onClick={submit} disabled={isSaving || !amount}>
                {isSaving ? t('offer.sending') : t('offer.send')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              {myOffer?.status === 'pending' && (
                <Button variant="outline" className="flex-1" onClick={() => setShowForm(true)}>
                  {t('offer.change')}
                </Button>
              )}
              {canOfferAgain && (
                <Button variant="outline" className="flex-1" onClick={() => setShowForm(true)}>
                  {t('offer.again')}
                </Button>
              )}
              {isOpen && (
                <Button variant="ghost" className="flex-1" onClick={withdraw}>
                  {t('offer.withdraw')}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
