import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';
import { HandCoins } from 'lucide-react';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Textarea } from '../../../../components/ui/text-area';
import { Badge } from '../../../../components/ui/badge';
import { formatPriceDE } from '../../../../lib/utils';
import { getUserFacingErrorMessage } from '../../../../lib/errors';
import { loginPath } from '../../../../lib/loginRedirect';

interface PublicProductOfferProps {
  productId: Id<'products'>;
  currentPrice: number;
  eventTitle: string;
  isLoggedIn: boolean;
}

const STATUS_TEXT = {
  pending: { label: 'Wartet auf Antwort', variant: 'secondary' },
  accepted: { label: 'Angenommen', variant: 'default' },
  rejected: { label: 'Abgelehnt', variant: 'destructive' },
  withdrawn: { label: 'Zurückgezogen', variant: 'outline' },
  redeemed: { label: 'Gekauft', variant: 'default' },
} as const;

/** Buyer side of online price offers: send, update or withdraw an offer. */
export function PublicProductOffer({
  productId,
  currentPrice,
  eventTitle,
  isLoggedIn,
}: PublicProductOfferProps) {
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
      toast.error('Bitte gib einen gültigen Betrag ein.');
      return;
    }
    setIsSaving(true);
    try {
      await makeOffer({ productId, amount: value, message: message || undefined });
      toast.success('Dein Vorschlag wurde an den Verkäufer geschickt.');
      setShowForm(false);
      setAmount('');
      setMessage('');
    } catch (error) {
      toast.error('Vorschlag konnte nicht gesendet werden', {
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
      toast.success('Vorschlag zurückgezogen');
    } catch (error) {
      toast.error('Fehler', { description: getUserFacingErrorMessage(error) });
    }
  };

  const isOpen = myOffer?.status === 'pending' || myOffer?.status === 'accepted';
  const canOfferAgain = !myOffer || myOffer.status === 'rejected' || myOffer.status === 'withdrawn';

  return (
    <div className="space-y-3 border-t pt-5">
      <div className="flex items-center gap-2">
        <HandCoins className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Preis vorschlagen</h3>
      </div>

      {!isLoggedIn ? (
        <p className="text-sm text-muted-foreground">
          Der Verkäufer nimmt Preisvorschläge an.{' '}
          <Link
            to={loginPath(location.pathname + location.search)}
            className="text-primary underline"
          >
            Melde dich an
          </Link>
          , um einen Preis vorzuschlagen.
        </p>
      ) : (
        <>
          {myOffer && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted p-3">
              <div className="text-sm">
                Dein Vorschlag: <b>{formatPriceDE(myOffer.amount)} €</b>
              </div>
              <Badge variant={STATUS_TEXT[myOffer.status].variant}>
                {STATUS_TEXT[myOffer.status].label}
              </Badge>
            </div>
          )}
          {myOffer?.status === 'accepted' && (
            <p className="text-sm text-muted-foreground">
              Bezahlt wird vor Ort bei „{eventTitle}“. Nenne an der Kasse deinen Namen, dort ist der
              vereinbarte Preis hinterlegt.
            </p>
          )}

          {(showForm || (canOfferAgain && !myOffer)) && myOffer?.status !== 'accepted' ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="offer-amount">
                  Dein Preis (aktuell {formatPriceDE(currentPrice)} €)
                </Label>
                <Input
                  id="offer-amount"
                  inputMode="decimal"
                  placeholder="z. B. 80"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="offer-message">Nachricht (optional)</Label>
                <Textarea
                  id="offer-message"
                  maxLength={300}
                  rows={2}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
              <Button className="w-full" onClick={submit} disabled={isSaving || !amount}>
                {isSaving ? 'Wird gesendet...' : 'Vorschlag senden'}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              {myOffer?.status === 'pending' && (
                <Button variant="outline" className="flex-1" onClick={() => setShowForm(true)}>
                  Vorschlag ändern
                </Button>
              )}
              {canOfferAgain && (
                <Button variant="outline" className="flex-1" onClick={() => setShowForm(true)}>
                  Neuen Vorschlag machen
                </Button>
              )}
              {isOpen && (
                <Button variant="ghost" className="flex-1" onClick={withdraw}>
                  Zurückziehen
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
