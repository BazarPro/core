import { useTranslation } from 'react-i18next';
import { discountedPrice } from '../../shared/eventFeatures';
import { Badge } from '../ui/badge';
import { ImageWithFallback } from '../ui/image-with-fallback';
import type { Id } from '../../lib/api/types';
import { formatPriceDE } from '../../lib/utils';
import { cn } from '../../lib/utils';

interface Product {
  _id: Id<'products'>;
  title: string;
  description: string;
  price: number;
  images: Id<'_storage'>[];
  sold: boolean;
  productCategory: string; // ID of the category
  discountPercent?: number;
}

interface ProductCardProps {
  product: Product;
  categoryLabel?: string;
}

export function ProductCard({ product, categoryLabel }: ProductCardProps) {
  const { t } = useTranslation('events');
  const reducedPrice = product.discountPercent
    ? discountedPrice(product.price, product.discountPercent)
    : null;

  return (
    <div
      className={cn(
        'bg-card rounded-xl border shadow-xs overflow-hidden hover:shadow-md transition-shadow h-full flex flex-col',
        product.sold && 'opacity-75 grayscale-[0.5]'
      )}
    >
      <div className="relative">
        <div className="aspect-video bg-muted overflow-hidden">
          <ImageWithFallback
            storageId={product.images[0]}
            alt={product.title}
            className="w-full h-full object-cover"
          />
        </div>
        {product.sold && (
          <div className="absolute inset-0 bg-black/10 flex items-center justify-center pointer-events-none">
            <div className="bg-background/90 backdrop-blur-sm px-4 py-1.5 rounded-full border shadow-lg transform -rotate-3">
              <span className="text-lg font-black tracking-tighter uppercase text-muted-foreground">
                {t('preview.sold')}
              </span>
            </div>
          </div>
        )}
        <div className="absolute top-3 right-3 flex flex-col gap-1 items-end">
          {product.discountPercent && product.discountPercent > 0 && !product.sold && (
            <Badge variant="destructive">-{product.discountPercent}%</Badge>
          )}
        </div>
      </div>

      <div className="p-4 flex flex-col flex-1">
        <h3 className="text-base font-semibold mb-1 line-clamp-1">{product.title}</h3>
        <p className="text-sm text-muted-foreground mb-4 line-clamp-2 min-h-[40px]">
          {product.description}
        </p>

        <div className="mt-auto pt-2">
          {categoryLabel && (
            <div className="mb-2 flex">
              <Badge
                variant="outline"
                className="truncate inline-block max-w-full"
                title={categoryLabel}
              >
                {categoryLabel}
              </Badge>
            </div>
          )}
          <div className="flex flex-col">
            {reducedPrice ? (
              <>
                <div className="text-sm text-muted-foreground line-through">
                  {formatPriceDE(product.price)} €
                </div>
                <div className="text-xl font-semibold tabular-nums text-destructive">
                  {formatPriceDE(reducedPrice)} €
                </div>
              </>
            ) : (
              <div className="text-xl font-semibold tabular-nums">
                {formatPriceDE(product.price)} €
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
