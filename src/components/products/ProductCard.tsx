import { Badge } from '../ui/badge';
import { ImageWithFallback } from '../ui/image-with-fallback';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import type { Id } from '../../../convex/_generated/dataModel';
import { formatPriceDE } from '../../lib/utils';
import { cn } from '../utils';

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
  selected?: boolean;
  onSelect?: (id: Id<'products'>) => void;
  onEdit?: (id: Id<'products'>) => void;
  onViewQR?: (id: Id<'products'>, title: string) => void;
  showSelection?: boolean;
  showActions?: boolean;
}

export function ProductCard({
  product,
  categoryLabel,
  selected = false,
  onSelect,
  onEdit,
  onViewQR,
  showSelection = false,
  showActions = true,
}: ProductCardProps) {
  const discountedPrice = product.discountPercent
    ? product.price * (1 - product.discountPercent / 100)
    : null;

  return (
    <div
      className={cn(
        'bg-card rounded-lg border overflow-hidden hover:shadow-lg transition-shadow h-full flex flex-col',
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
                Verkauft
              </span>
            </div>
          </div>
        )}
        {showSelection && onSelect && (
          <div className="absolute top-3 left-3">
            <Checkbox
              checked={selected}
              onCheckedChange={() => onSelect(product._id)}
              className="bg-background"
            />
          </div>
        )}
        <div className="absolute top-3 right-3 flex flex-col gap-1 items-end">
          {product.discountPercent && product.discountPercent > 0 && !product.sold && (
            <Badge variant="destructive">-{product.discountPercent}%</Badge>
          )}
        </div>
      </div>

      <div className="p-4 flex flex-col flex-1">
        <h3 className="text-lg font-semibold mb-1 line-clamp-1">{product.title}</h3>
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
            {discountedPrice ? (
              <>
                <div className="text-sm text-muted-foreground line-through">
                  {formatPriceDE(product.price)} €
                </div>
                <div className="text-2xl font-bold text-destructive">
                  {formatPriceDE(discountedPrice)} €
                </div>
              </>
            ) : (
              <div className="text-2xl font-bold">{formatPriceDE(product.price)} €</div>
            )}
          </div>
        </div>

        {showActions && (onEdit || onViewQR) && (
          <div className="flex gap-2 mt-4">
            {onEdit && !product.sold && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => onEdit(product._id)}
              >
                Bearbeiten
              </Button>
            )}
            {onViewQR && (
              <Button
                size="sm"
                className="flex-1"
                onClick={() => onViewQR(product._id, product.title)}
              >
                QR-Code
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
