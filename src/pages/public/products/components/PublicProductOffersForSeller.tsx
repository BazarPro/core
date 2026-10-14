import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { toast } from 'sonner';
import { Check, HandCoins, X } from 'lucide-react';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { Button } from '../../../../components/ui/button';
import { Badge } from '../../../../components/ui/badge';
import { formatPriceDE } from '../../../../lib/utils';
import { getUserFacingErrorMessage } from '../../../../lib/errors';

type OfferView = FunctionReturnType<typeof api.offers.getOffersForProduct>[number];

/** Seller side of online price offers: accept or reject open offers. */
export function PublicProductOffersForSeller({ productId }: { productId: Id<'products'> }) {
  const offers = useQuery(api.offers.getOffersForProduct, { productId });
  if (!offers || offers.length === 0) return null;
  return (
    <div className="space-y-3 border-t pt-4">
      <OfferListHeader count={offers.length} />
      <p className="text-sm text-muted-foreground">
        Nimmst du einen Vorschlag an, werden die anderen abgelehnt. Der Käufer zahlt den
        vereinbarten Preis vor Ort an der Kasse.
      </p>
      <OfferList offers={offers} canRespond />
    </div>
  );
}

export function OfferListHeader({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-2">
      <HandCoins className="h-4 w-4 text-primary" />
      <h4 className="font-semibold">Preisvorschläge</h4>
      <Badge variant="secondary" className="ml-auto">
        {count}
      </Badge>
    </div>
  );
}

/** Open and accepted offers; with `canRespond` they can be accepted or rejected. */
export function OfferList({ offers, canRespond }: { offers: OfferView[]; canRespond: boolean }) {
  const respond = useMutation(api.offers.respondToOffer);

  const handle = async (offerId: Id<'productOffers'>, accept: boolean) => {
    try {
      await respond({ offerId, accept });
      toast.success(accept ? 'Vorschlag angenommen' : 'Vorschlag abgelehnt');
    } catch (error) {
      toast.error('Fehler', { description: getUserFacingErrorMessage(error) });
    }
  };

  return (
    <ul className="space-y-2">
      {offers.map((offer) => (
        <li key={offer._id} className="rounded-xl border p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-semibold">{formatPriceDE(offer.amount)} €</div>
              <div className="text-xs text-muted-foreground">
                von {offer.buyerName} am {new Date(offer.createdAt).toLocaleDateString('de-DE')}
              </div>
            </div>
            {offer.status === 'accepted' ? (
              <Badge>Angenommen</Badge>
            ) : !canRespond ? (
              <Badge variant="secondary">Offen</Badge>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" className="gap-1" onClick={() => handle(offer._id, true)}>
                  <Check className="h-4 w-4" />
                  Annehmen
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => handle(offer._id, false)}
                >
                  <X className="h-4 w-4" />
                  Ablehnen
                </Button>
              </div>
            )}
          </div>
          {offer.message && (
            <p className="text-sm text-muted-foreground italic">„{offer.message}“</p>
          )}
        </li>
      ))}
    </ul>
  );
}
