import { ArrowRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../../lib/api/functions';
import type { Id } from '../../lib/api/types';
import { usePublicQuery } from '../../hooks/usePublicQuery';
import { isOnOffer } from '../../lib/eventProductStatus';
import { categoryNames } from '../../i18n/categories';
import { ScrollRow } from '../ui/scroll-row';
import { ProductCard } from '../products/ProductCard';
import { useTranslation } from 'react-i18next';

const PREVIEW_COUNT = 10;
const TILE_WIDTH = 'w-[44%] shrink-0 snap-start sm:w-[31%] lg:w-[23.5%]';

/**
 * Swipeable row with the first offers of an event, in the cards of the full list, so the
 * preview shows what the list shows: items handed in and not sold yet. Tiles open the
 * product page, the heading and the last tile the full list. Hidden without offers.
 */
export function EventProductPreview({
  eventId,
  comingSoon = false,
}: {
  eventId: Id<'events'>;
  /** Without offers, say they are still to come (while the bazaar runs with an online list) */
  comingSoon?: boolean;
}) {
  const { t } = useTranslation('events');
  const allProducts = usePublicQuery(api.eventProducts.getProductsForEvent, { eventId });
  const categories = usePublicQuery(api.categories.getAllCategories, {});
  const location = useLocation();
  const products = allProducts?.filter(isOnOffer);
  if (!products) return null;
  if (products.length === 0) {
    return comingSoon ? (
      <p className="mb-10 rounded-xl border-2 border-dashed p-5 text-center text-sm text-muted-foreground">
        {t('preview.comingSoon')}
      </p>
    ) : null;
  }

  // Discounted ones first, as the full list sorts them
  const preview = [...products]
    .sort((a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0))
    .slice(0, PREVIEW_COUNT);
  const allOffers = { pathname: `/public-events/${eventId}/products` };

  return (
    <section className="mb-10" aria-labelledby="event-offers-heading">
      <div className="mb-4 flex items-end justify-between gap-4">
        <Link to={allOffers} state={location.state} className="group">
          <h2
            id="event-offers-heading"
            className="flex items-center gap-2 text-2xl font-bold tracking-tight group-hover:text-primary"
          >
            {t('preview.offers')}
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-semibold text-primary">
              {products.length}
            </span>
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </h2>
        </Link>
      </div>

      <ScrollRow
        contentKey={preview.length}
        className="-mx-4 items-stretch gap-3 scroll-px-4 px-4 pb-3 sm:gap-4"
      >
        {preview.map((product) => (
          <Link
            key={product._id}
            to={`/products/view/${product._id}`}
            state={{ from: 'public-event', eventId }}
            className={`${TILE_WIDTH} rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
          >
            <ProductCard
              product={product}
              categoryLabel={
                categories ? categoryNames([product.productCategory], categories)?.[0] : undefined
              }
            />
          </Link>
        ))}
        <Link
          to={allOffers}
          state={location.state}
          className={`${TILE_WIDTH} group flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-4 text-center text-primary transition-colors hover:border-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform group-hover:translate-x-1">
            <ArrowRight className="h-5 w-5" />
          </span>
          <span className="font-semibold">{t('preview.all', { count: products.length })}</span>
        </Link>
      </ScrollRow>
    </section>
  );
}
