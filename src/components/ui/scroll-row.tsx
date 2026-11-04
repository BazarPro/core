import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { Button } from './button';

/**
 * Swipeable row of cards with arrows on larger screens, shown only where there is
 * more to see. `contentKey` tells the arrows that the cards changed. To start over
 * with other cards, give the row a React `key`: browsers keep a snapping row on the
 * card it showed, even if new cards come before it.
 */
export function ScrollRow({
  children,
  contentKey,
  className,
}: {
  children: ReactNode;
  contentKey?: unknown;
  className?: string;
}) {
  const { t } = useTranslation('common');
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [canScroll, setCanScroll] = useState({ back: false, forward: false });

  const update = useCallback(() => {
    if (!scroller) return;
    const tolerance = 2;
    setCanScroll({
      back: scroller.scrollLeft > tolerance,
      forward: scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - tolerance,
    });
  }, [scroller]);

  useEffect(() => {
    if (!scroller) return;
    scroller.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    return () => {
      scroller.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [scroller, update]);

  useEffect(update, [update, contentKey]);

  const scroll = (direction: 1 | -1) =>
    scroller?.scrollBy({ left: direction * scroller.clientWidth * 0.8, behavior: 'smooth' });

  const arrow =
    'absolute top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-background shadow-lg';

  return (
    <div className="relative">
      {canScroll.back && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn(arrow, '-left-4 md:flex')}
          aria-label={t('scroll.back')}
          onClick={() => scroll(-1)}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
      )}
      {canScroll.forward && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn(arrow, '-right-4 md:flex')}
          aria-label={t('scroll.forward')}
          onClick={() => scroll(1)}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      )}
      <div
        ref={setScroller}
        className={cn(
          'flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
