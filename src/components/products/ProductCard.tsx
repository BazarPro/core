import { useTranslation } from 'react-i18next';
import type { Id } from '../../lib/api/types';
import { cn } from '../../lib/utils';
import { ProductMedia } from './ProductMedia';
import { ProductPrice } from './ProductPrice';

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
  /** A tile of the grid, or a compact row for items that mostly have no photo */
  layout?: 'grid' | 'list';
}

/** An offer of a bazaar for visitors: photo or placeholder, title, category and price. */
export function ProductCard({ product, categoryLabel, layout = 'grid' }: ProductCardProps) {
  const { t } = useTranslation('events');
  const discount = !product.sold ? (product.discountPercent ?? 0) : 0;
  const price = { price: product.price, discountPercent: discount, sold: product.sold };

  if (layout === 'list') {
    return (
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg border bg-card p-2 pr-4 shadow-xs transition-shadow hover:shadow-md sm:gap-4',
          product.sold && 'opacity-75'
        )}
      >
        <ProductMedia
          title={product.title}
          images={product.images}
          size="sm"
          dimmed={product.sold}
          className="h-14 w-14 shrink-0 rounded-md sm:h-16 sm:w-16"
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold sm:text-base">{product.title}</h3>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            {categoryLabel && <span className="truncate">{categoryLabel}</span>}
            {product.sold && (
              <span className="rounded-full bg-foreground/80 px-2 py-px font-semibold text-background">
                {t('preview.sold')}
              </span>
            )}
          </div>
        </div>
        <ProductPrice item={price} size="sm" align="end" className="shrink-0" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'bg-card rounded-xl border shadow-xs overflow-hidden hover:shadow-md transition-shadow h-full flex flex-col',
        product.sold && 'opacity-75'
      )}
    >
      <div className="relative">
        <ProductMedia
          title={product.title}
          images={product.images}
          dimmed={product.sold}
          className="aspect-video"
        />
        {product.sold && (
          <div className="absolute inset-0 bg-black/10 flex items-center justify-center pointer-events-none">
            <div className="bg-background/90 backdrop-blur-sm px-4 py-1.5 rounded-full border shadow-lg transform -rotate-3">
              <span className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                {t('preview.sold')}
              </span>
            </div>
          </div>
        )}
        {discount > 0 && (
          <span className="absolute right-3 top-3 rounded-full bg-destructive px-2.5 py-0.5 text-xs font-semibold text-white shadow">
            −{discount} %
          </span>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1 gap-1">
        <h3 className="text-base font-semibold line-clamp-1">{product.title}</h3>
        {categoryLabel && (
          <p className="truncate text-xs text-muted-foreground" title={categoryLabel}>
            {categoryLabel}
          </p>
        )}
        {product.description && (
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{product.description}</p>
        )}
        <div className="mt-auto pt-3">
          <ProductPrice item={price} showPercent={false} />
        </div>
      </div>
    </div>
  );
}
