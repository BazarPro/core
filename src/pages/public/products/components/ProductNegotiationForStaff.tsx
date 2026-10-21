import { useState } from 'react';
import { useQuery } from '../../../../lib/api/react';
import { Eye, EyeOff, HandCoins, Lock } from 'lucide-react';
import { api } from '../../../../lib/api/functions';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { formatPriceDE } from '../../../../lib/utils';
import { OfferList, OfferListHeader } from './PublicProductOffersForSeller';
import { Trans, useTranslation } from 'react-i18next';

interface ProductNegotiationForStaffProps {
  productId: Id<'products'>;
  /** Seller's lowest price; only set when the event allows negotiating. */
  minimumPrice?: number;
  /** Event allows online offers and the seller accepts them. */
  acceptsOffers: boolean;
  /** Item accepted and event running, see areOffersOpen. */
  offersOpen: boolean;
}

/**
 * What organizers and helpers need to tell a visitor at the stand: can the price be
 * negotiated, and down to what (hidden until revealed), and can offers be sent online.
 */
export function ProductNegotiationForStaff({
  productId,
  minimumPrice,
  acceptsOffers,
  offersOpen,
}: ProductNegotiationForStaffProps) {
  const { t } = useTranslation('organizer');
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
        <h4 className="font-semibold">{t('staff.negotiate')}</h4>
        {negotiable ? (
          <Badge className="ml-auto">{t('staff.negotiable')}</Badge>
        ) : (
          <Badge variant="secondary" className="ml-auto gap-1">
            <Lock className="h-3 w-3" /> {t('staff.fixed')}
          </Badge>
        )}
      </div>

      {negotiable ? (
        <div className="rounded-xl bg-muted/60 p-3 text-sm space-y-2">
          <p>{t('staff.minimumHint')}</p>
          {showMinimum ? (
            <div className="flex items-center justify-between gap-2">
              <span>
                <Trans
                  i18nKey="staff.minimum"
                  ns="organizer"
                  values={{ price: formatPriceDE(minimumPrice) }}
                  components={{ b: <b className="tabular-nums" /> }}
                />
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => setShowMinimum(false)}
              >
                <EyeOff className="h-4 w-4" /> {t('staff.hide')}
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setShowMinimum(true)}
            >
              <Eye className="h-4 w-4" /> {t('staff.show')}
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('staff.noMinimum')}</p>
      )}

      {acceptsOffers && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {offersOpen ? t('staff.offersOpen') : t('staff.offersLater')}
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
