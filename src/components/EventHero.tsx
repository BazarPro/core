import { Calendar, MapPin } from 'lucide-react';
import { ImageWithFallback } from './ui/image-with-fallback';
import type { Id } from '../../convex/_generated/dataModel';
import { formatDateRangeDE } from '../lib/utils';
import { cn } from './utils';

interface EventHeroProps {
  title: string;
  coverImage?: Id<'_storage'>;
  startDate: number;
  endDate: number;
  location: string;
  maxHeightClassName?: string;
  imageClassName?: string;
  publicEventButton?: React.ReactNode;
  children?: React.ReactNode;
  isPast?: boolean;
}

export function EventHero({
  title,
  coverImage,
  startDate,
  endDate,
  location,
  maxHeightClassName,
  imageClassName,
  publicEventButton,
  children,
  isPast,
}: EventHeroProps) {
  const hasActions = publicEventButton || children;

  return (
    <div className="relative rounded-2xl overflow-hidden mb-8 shadow-2xl">
      <div
        className={cn(
          'relative aspect-[16/10] md:aspect-[21/9] bg-muted max-h-[800px] min-h-[260px] md:min-h-[380px] overflow-hidden',
          maxHeightClassName
        )}
      >
        <ImageWithFallback
          alt={title}
          storageId={coverImage}
          className={cn(
            'absolute inset-0 block w-full h-full object-cover transition-all duration-500',
            isPast && 'grayscale opacity-75 scale-105',
            imageClassName
          )}
        />
        {isPast && (
          <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px] flex items-center justify-center">
            <div className="bg-background/90 backdrop-blur-md px-6 py-3 rounded-full border shadow-xl transform -rotate-2">
              <span className="text-xl md:text-3xl font-black tracking-tighter uppercase text-muted-foreground">
                Veranstaltung Beendet
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-end">
        <div className="p-6 md:p-10 text-white w-full flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-5xl font-bold mb-3 leading-tight">{title}</h1>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm md:text-lg opacity-90">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 md:h-5 md:w-5" />
                <span>{formatDateRangeDE(startDate, endDate)}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 md:h-5 md:w-5" />
                <span>{location}</span>
              </div>
            </div>
          </div>
          {hasActions && (
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              {publicEventButton}
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
