import type { Id } from '../../lib/api/types';
import { cn } from '../../lib/utils';
import { ImageWithFallback } from '../ui/image-with-fallback';
import { ProductPlaceholder } from './ProductPlaceholder';

/**
 * The first photo of an item, or its placeholder when it has none. Fills its box; the
 * caller sets the shape (a square thumbnail, a 16:9 card header).
 */
export function ProductMedia({
  title,
  images,
  imageSrc,
  seed,
  size = 'md',
  dimmed = false,
  className,
}: {
  title: string;
  images: readonly Id<'_storage'>[];
  /** A fixed picture instead of a stored one, e.g. the onboarding sample */
  imageSrc?: string;
  /** Picks the placeholder colour; the title by default */
  seed?: string;
  size?: 'sm' | 'md' | 'lg';
  dimmed?: boolean;
  className?: string;
}) {
  const hasImage = images.length > 0 || !!imageSrc;
  return (
    <div className={cn('overflow-hidden bg-muted', dimmed && 'grayscale-[0.6]', className)}>
      {hasImage ? (
        <ImageWithFallback
          storageId={images[0]}
          src={imageSrc}
          alt={title}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <ProductPlaceholder title={title} seed={seed ?? title} size={size} />
      )}
    </div>
  );
}
