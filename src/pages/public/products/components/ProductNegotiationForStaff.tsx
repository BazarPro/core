import { useState } from 'react';
import { useQuery } from 'convex/react';
import { Eye, EyeOff, HandCoins, Lock } from 'lucide-react';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { formatPriceDE } from '../../../../lib/utils';
import { OfferList, OfferListHeader } from './PublicProductOffersForSeller';

interface ProductNegotiationForStaffProps {
  productId: Id<'products'>;
  /** Seller's lowest price; only set when the event allows negotiating. */
  minimumPrice?: number;
  /** Event allows online offers and the seller accepts them. */
  acceptsOffers: boolean;
}

/**
 * What organizers and helpers need to tell a visitor at the stand: can the price be
 * negotiated, and down to what (hidden until revealed), and can offers be sent online.
 */
export function ProductNegotiationForStaff({
  productId,
  minimumPrice,
  acceptsOffers,
}: ProductNegotiationForStaffProps) {
  const [showMinimum, setShowMinimum] = useState(false);
  const staffOffers = useQuery(
    api.offers.getOffersForStaff,
    acceptsOffers ? { productId } : 'skip'
  );
  const negotiable = minimumPrice !== undefined;

  return (
    <div className="space-y-3 border-t pt-4" data-testid="staff-negotiation">
      <div className="flex flex-wrap items-center gap-2">
        <HandCoins className="h-4 w-4 text-primary" />
        <h4 className="font-semibold">Verhandeln</h4>
        {negotiable ? (
          <Badge className="ml-auto">VB · Preis verhandelbar</Badge>
        ) : (
          <Badge variant="secondary" className="ml-auto gap-1">
            <Lock className="h-3 w-3" /> Festpreis
          </Badge>
        )}
      </div>

      {negotiable ? (
        <div className="rounded-xl bg-muted/60 p-3 text-sm space-y-2">
          <p>An der Kasse darf bis zum Mindestpreis des Verkäufers nachgelassen werden.</p>
          {showMinimum ? (
            <div className="flex items-center justify-between gap-2">
              <span>
                Mindestpreis: <b className="tabular-nums">{formatPriceDE(minimumPrice)} €</b>
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => setShowMinimum(false)}
              >
                <EyeOff className="h-4 w-4" /> Ausblenden
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setShowMinimum(true)}
            >
              <Eye className="h-4 w-4" /> Mindestpreis anzeigen
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Der Verkäufer hat keinen Mindestpreis hinterlegt, an der Kasse gilt der angezeigte Preis.
        </p>
      )}

      {acceptsOffers && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Der Verkäufer nimmt Preisvorschläge an: Interessenten können auf dieser Seite angemeldet
            einen Preis vorschlagen.
          </p>
          {staffOffers && staffOffers.offers.length > 0 && (
            <>
              <OfferListHeader count={staffOffers.offers.length} />
              <OfferList offers={staffOffers.offers} canRespond={staffOffers.canRespond} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
