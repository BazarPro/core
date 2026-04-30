import { Calendar, ChevronLeft, ChevronRight, MapPin, ShoppingBag } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../../../components/ui/button';
import { ImageWithFallback } from '../../../../components/ui/image-with-fallback';
import { formatDateDE, formatDateRangeDE } from '../../../../lib/utils';
import { stripMarkdownToText } from '../../../../lib/markdown';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { Checkbox } from '../../../../components/ui/checkbox';
import { Label } from '../../../../components/ui/label';

export interface LandingEvent {
  _id: Id<'events'>;
  title: string;
  description: string;
  startDate: number;
  endDate?: number;
  location: string;
  coverImage?: Id<'_storage'>;
}

interface LandingEventsSectionProps {
  events: LandingEvent[];
  onEventClick: (eventId: string) => void;
  includePast: boolean;
  onIncludePastChange: (include: boolean) => void;
}

export function LandingEventsSection({
  events,
  onEventClick,
  includePast,
  onIncludePastChange,
}: LandingEventsSectionProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollButtons = useMemo(() => {
    return () => {
      const el = scrollerRef.current;
      if (!el) return;
      const epsilon = 2;
      setCanScrollLeft(el.scrollLeft > epsilon);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - epsilon);
    };
  }, []);

  useEffect(() => {
    updateScrollButtons();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollButtons, { passive: true });
    const ro = new ResizeObserver(() => updateScrollButtons());
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollButtons as EventListener);
      ro.disconnect();
    };
  }, [events.length, updateScrollButtons]);

  const scrollByOneCard = (direction: 'left' | 'right') => {
    const el = scrollerRef.current;
    if (!el) return;
    const firstCard = el.querySelector<HTMLElement>('[data-landing-event-card]');
    const gapPx = 24;
    const cardWidth = firstCard?.offsetWidth ?? Math.round(el.clientWidth * 0.85);
    const delta = cardWidth + gapPx;
    el.scrollBy({ left: direction === 'left' ? -delta : delta, behavior: 'smooth' });
  };

  const now = Date.now();

  return (
    <section className="py-20 bg-muted/30 border-y">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center mb-12 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <ShoppingBag className="w-4 h-4" />
            <span>Marktplatz</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Aktuelle Veranstaltungen
          </h2>
          <p className="text-muted-foreground">
            Entdecke öffentliche Events in deiner Nähe und starte direkt mit dem Verkauf.
          </p>

          <div className="flex items-center justify-center gap-3 pt-2">
            <div className="flex items-center space-x-2 bg-background border px-3 py-1.5 rounded-full shadow-sm">
              <Checkbox
                id="include-past"
                checked={includePast}
                onCheckedChange={(checked) => onIncludePastChange(!!checked)}
              />
              <Label htmlFor="include-past" className="cursor-pointer text-xs font-medium">
                Vergangene anzeigen
              </Label>
            </div>
          </div>
        </div>

        {events.length > 0 ? (
          <div className="relative max-w-7xl mx-auto md:px-8">
            {canScrollLeft && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="hidden md:flex absolute -left-4 top-1/2 -translate-y-1/2 z-20 rounded-full shadow-lg bg-background"
                onClick={() => scrollByOneCard('left')}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            )}
            {canScrollRight && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="hidden md:flex absolute -right-4 top-1/2 -translate-y-1/2 z-20 rounded-full shadow-lg bg-background"
                onClick={() => scrollByOneCard('right')}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            )}
            <div
              ref={scrollerRef}
              className="flex items-stretch gap-6 overflow-x-auto pb-6 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-2"
            >
              {events.map((event) => {
                const isPast = event.endDate ? event.endDate < now : event.startDate < now;
                return (
                  <div
                    key={event._id}
                    data-landing-event-card
                    className={`snap-start shrink-0 w-[85%] sm:w-[70%] md:w-[45%] lg:w-[35%] xl:w-[30%] bg-card rounded-xl border overflow-hidden hover:shadow-md transition-all flex flex-col self-stretch ${isPast ? 'opacity-75 grayscale-[0.5]' : ''}`}
                  >
                    <div className="aspect-[16/10] overflow-hidden relative border-b">
                      <ImageWithFallback
                        storageId={event.coverImage}
                        alt={event.title}
                        className="w-full h-full object-cover"
                      />
                      {isPast && (
                        <div className="absolute top-3 right-3 bg-muted/90 backdrop-blur-sm text-muted-foreground px-2 py-1 rounded text-[10px] font-bold border border-border">
                          BEENDET
                        </div>
                      )}
                    </div>
                    <div className="p-5 flex flex-col flex-1 space-y-4">
                      <div className="space-y-1 flex-1">
                        <h3 className="text-lg font-bold line-clamp-1 leading-tight">
                          {event.title}
                        </h3>
                        <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
                          {stripMarkdownToText(event.description)}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs font-medium">
                          <Calendar className="h-3.5 w-3.5 text-primary" />
                          <span className="text-foreground">
                            {event.endDate
                              ? formatDateRangeDE(event.startDate, event.endDate)
                              : formatDateDE(event.startDate)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-medium">
                          <MapPin className="h-3.5 w-3.5 text-secondary-foreground/70" />
                          <span className="text-foreground line-clamp-1">{event.location}</span>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-10 rounded-lg text-sm"
                        onClick={() => onEventClick(event._id)}
                      >
                        Details ansehen
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-16 bg-background rounded-xl border-2 border-dashed flex flex-col items-center justify-center space-y-3 max-w-md mx-auto">
            <Calendar className="h-8 w-8 text-muted-foreground/30" />
            <div className="space-y-1">
              <h4 className="font-bold">Keine Veranstaltungen</h4>
              <p className="text-sm text-muted-foreground">
                {includePast
                  ? 'Es wurden keine Veranstaltungen gefunden.'
                  : 'Derzeit sind keine öffentlichen Veranstaltungen verfügbar.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
