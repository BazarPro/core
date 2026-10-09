import { ArrowRight, ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import { useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { usePublicQuery } from '../../hooks/usePublicQuery';
import { cn, formatPriceDE } from '../../lib/utils';
import { Button } from '../ui/button';

const PREVIEW_COUNT = 10;
const TILE_WIDTH = 'aspect-[4/5] w-[42%] shrink-0 snap-start sm:w-[30%] lg:w-[22%]';

interface EventProductPreviewProps {
  eventId: Id<'events'>;
}

/**
 * Swipeable row with the first offers of an event. Tiles open the product
 * page, the heading and the last tile the full offer list. Hidden while the
 * event has no visible offers.
 */
export function EventProductPreview({ eventId }: EventProductPreviewProps) {
  const products = usePublicQuery(api.eventProducts.getProductsForEvent, { eventId });
  const location = useLocation();
  const scroller = useRef<HTMLUListElement>(null);
  if (!products || products.length === 0) return null;

  // Available offers first, sold ones at the end
  const sorted = [...products].sort((a, b) => Number(a.sold) - Number(b.sold));
  const preview = sorted.slice(0, PREVIEW_COUNT);
  const allOffers = { pathname: `/public-events/${eventId}/products` };

  const scrollBy = (direction: 1 | -1) =>
    scroller.current?.scrollBy({
      left: direction * scroller.current.clientWidth * 0.8,
      behavior: 'smooth',
    });

  return (
    <section className="mb-10" aria-labelledby="event-offers-heading">
      <div className="mb-4 flex items-end justify-between gap-4">
        <Link to={allOffers} state={location.state} className="group">
          <h2
            id="event-offers-heading"
            className="flex items-center gap-2 text-2xl font-bold tracking-tight group-hover:text-primary"
          >
            Angebote
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-semibold text-primary">
              {products.length}
            </span>
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </h2>
        </Link>
        {preview.length + 1 > 4 && (
          <div className="hidden gap-2 lg:flex">
            <Button
              variant="outline"
              size="icon"
              aria-label="Zurückblättern"
              onClick={() => scrollBy(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Weiterblättern"
              onClick={() => scrollBy(1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <ul
        ref={scroller}
        className="-mx-4 flex items-start snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-3 [scrollbar-width:none] sm:gap-4 [&::-webkit-scrollbar]:hidden"
      >
        {preview.map((product) => {
          const discount = product.discountPercent ?? 0;
          const price = discount > 0 ? product.price * (1 - discount / 100) : product.price;
          return (
            <li key={product._id} className={TILE_WIDTH}>
              <Link
                to={`/products/view/${product._id}`}
                state={location.state}
                className="group block h-full overflow-hidden rounded-2xl border bg-muted shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="relative h-full overflow-hidden">
                  <TileImage
                    storageId={product.images[0]}
                    alt={product.title}
                    dimmed={product.sold}
                  />
                  {product.sold ? (
                    <span className="absolute left-2 top-2 rounded-full bg-foreground/80 px-2.5 py-0.5 text-xs font-semibold text-background">
                      Verkauft
                    </span>
                  ) : (
                    discount > 0 && (
                      <span className="absolute left-2 top-2 rounded-full bg-destructive px-2.5 py-0.5 text-xs font-semibold text-white">
                        −{discount} %
                      </span>
                    )
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-3 pt-10 text-white">
                    <p className="line-clamp-2 text-sm font-semibold leading-snug">
                      {product.title}
                    </p>
                    <p className="mt-0.5 text-lg font-bold">
                      {formatPriceDE(price)} €
                      {discount > 0 && !product.sold && (
                        <span className="ml-1.5 text-xs font-normal line-through opacity-75">
                          {formatPriceDE(product.price)} €
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
        <li className={TILE_WIDTH}>
          <Link
            to={allOffers}
            state={location.state}
            className="group flex h-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-4 text-center text-primary transition-colors hover:border-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform group-hover:translate-x-1">
              <ArrowRight className="h-5 w-5" />
            </span>
            <span className="font-semibold">Alle {products.length} Angebote ansehen</span>
          </Link>
        </li>
      </ul>
    </section>
  );
}

function TileImage({
  storageId,
  alt,
  dimmed,
}: {
  storageId: Id<'_storage'> | undefined;
  alt: string;
  dimmed: boolean;
}) {
  const urls = usePublicQuery(
    api.products.getImageUrls,
    storageId ? { storageIds: [storageId] } : 'skip'
  );
  const url = urls?.[0];
  if (!url) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        {storageId && urls === undefined ? null : <ImageOff className="h-8 w-8" />}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className={cn(
        'h-full w-full object-cover transition-transform duration-300 group-hover:scale-105',
        dimmed && 'opacity-60 grayscale'
      )}
    />
  );
}
