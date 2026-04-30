import { useState } from 'react';
import { Maximize2, X } from 'lucide-react';
import { ImageWithFallback } from '../../../../components/ui/image-with-fallback';
import { cn } from '../../../../lib/utils';

/**
 * Product image gallery: main image, thumbnail strip when multiple images, and fullscreen
 * overlay with optional thumbnail navigation.
 */
interface PublicProductImageGalleryProps {
  images: string[];
  productTitle: string;
  isSold?: boolean;
}

export function PublicProductImageGallery({
  images,
  productTitle,
  isSold,
}: PublicProductImageGalleryProps) {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const currentImage = images[selectedImageIndex] || images[0];

  return (
    <>
      <div className="space-y-4">
        <div
          className={cn(
            'aspect-square bg-muted rounded-lg overflow-hidden border relative group cursor-pointer',
            isSold && 'opacity-75 grayscale-[0.5]'
          )}
          onClick={() => setIsFullscreen(true)}
        >
          {currentImage ? (
            <>
              <ImageWithFallback
                src={currentImage}
                alt={productTitle}
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
              />
              {isSold && (
                <div className="absolute inset-0 bg-black/10 flex items-center justify-center pointer-events-none">
                  <div className="bg-background/90 backdrop-blur-md px-6 py-3 rounded-full border shadow-xl transform -rotate-3">
                    <span className="text-2xl md:text-4xl font-black tracking-tighter uppercase text-muted-foreground">
                      Verkauft
                    </span>
                  </div>
                </div>
              )}
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 text-white p-2 rounded-full">
                <Maximize2 className="h-5 w-5" />
              </div>
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              Kein Bild
            </div>
          )}
        </div>

        {images.length > 1 && (
          <div className="grid grid-cols-4 gap-2">
            {images.map((url, i) => (
              <div
                key={i}
                className={cn(
                  'aspect-square bg-muted rounded-lg overflow-hidden cursor-pointer border transition-colors',
                  selectedImageIndex === i
                    ? 'border-primary ring-2 ring-primary ring-offset-1'
                    : 'hover:border-primary',
                  isSold && 'grayscale-[0.5]'
                )}
                onClick={() => setSelectedImageIndex(i)}
              >
                <ImageWithFallback
                  src={url}
                  alt={`${productTitle} ${i + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {isFullscreen && currentImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 ![margin-block-end:0]"
          onClick={() => setIsFullscreen(false)}
        >
          <button
            onClick={() => setIsFullscreen(false)}
            className="absolute top-4 right-4 text-white hover:text-gray-300 bg-black/50 rounded-full p-2"
          >
            <X className="h-8 w-8" />
          </button>

          <img
            src={currentImage}
            alt={productTitle}
            className={cn(
              'max-h-full max-w-full object-contain',
              isSold && 'grayscale-[0.3] opacity-90'
            )}
            onClick={(e) => e.stopPropagation()}
          />

          {images.length > 1 && (
            <div
              className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 overflow-x-auto max-w-full px-4 py-2"
              onClick={(e) => e.stopPropagation()}
            >
              {images.map((url, i) => (
                <button
                  key={i}
                  className={cn(
                    'w-16 h-16 rounded-md overflow-hidden border-2 flex-shrink-0',
                    selectedImageIndex === i ? 'border-white' : 'border-transparent opacity-50',
                    isSold && 'grayscale-[0.5]'
                  )}
                  onClick={() => setSelectedImageIndex(i)}
                >
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
