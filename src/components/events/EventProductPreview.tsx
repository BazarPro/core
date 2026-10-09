import { ArrowRight, ImageOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { usePublicQuery } from '../../hooks/usePublicQuery';
import { cn, formatPriceDE } from '../../lib/utils';
import { Button } from '../ui/button';

const PREVIEW_COUNT = 8;

interface EventProductPreviewProps {
  eventId: Id<'events'>;
  onViewAll: () => void;
}

/** Tiles with the first offers of an event; hidden while there are none. */
export function EventProductPreview({ eventId, onViewAll }: EventProductPreviewProps) {
  const products = usePublicQuery(api.eventProducts.getProductsForEvent, { eventId });
  if (!products || products.length === 0) return null;

  // Available offers first, sold ones at the end
  const sorted = [...products].sort((a, b) => Number(a.sold) - Number(b.sold));
  const preview = sorted.slice(0, PREVIEW_COUNT);

  return (
    <section className="mb-8" aria-labelledby="event-offers-heading">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 id="event-offers-heading" className="text-2xl font-bold tracking-tight">
            Angebote
          </h2>
          <p className="text-sm text-muted-foreground">
            {products.length} Artikel bei diesem Basar
          </p>
        </div>
        {products.length > PREVIEW_COUNT && (
          <Button variant="ghost" className="group shrink-0" onClick={onViewAll}>
            Alle ansehen
            <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Button>
        )}
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {preview.map((product) => {
          const discount = product.discountPercent ?? 0;
          const price = discount > 0 ? product.price * (1 - discount / 100) : product.price;
          return (
            <li key={product._id}>
              <Link
                to={`/products/view/${product._id}`}
                className="group block overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="relative aspect-square overflow-hidden bg-muted">
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
                </div>
                <div className="space-y-0.5 p-3">
                  <p className="line-clamp-1 text-sm font-semibold">{product.title}</p>
                  <p className="text-base font-bold">
                    {formatPriceDE(price)} €
                    {discount > 0 && !product.sold && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground line-through">
                        {formatPriceDE(product.price)} €
                      </span>
                    )}
                  </p>
                  {product.locationLabel && (
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {product.locationLabel}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {products.length > PREVIEW_COUNT && (
        <Button variant="outline" className="mt-4 w-full sm:hidden" onClick={onViewAll}>
          Alle {products.length} Angebote ansehen
        </Button>
      )}
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
