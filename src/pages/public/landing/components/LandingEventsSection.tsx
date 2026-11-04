import { Calendar, MapPin, ShoppingBag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../../../components/ui/button';
import { ScrollRow } from '../../../../components/ui/scroll-row';
import { ImageWithFallback } from '../../../../components/ui/image-with-fallback';
import { formatDateDE, formatDateRangeDE } from '../../../../lib/utils';
import { stripMarkdownToText } from '../../../../lib/markdown';
import type { Id } from '../../../../lib/api/types';
import { Checkbox } from '../../../../components/ui/checkbox';
import { Label } from '../../../../components/ui/label';
import { CardGridSkeleton, Loading } from '../../../../components/ui/loading';
import { useTranslation } from 'react-i18next';
import { formatEventPlace } from '../../../../shared/eventJsonLd';

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
  /** undefined while loading */
  events: LandingEvent[] | undefined;
  includePast: boolean;
  onIncludePastChange: (include: boolean) => void;
  onCreateEventClick: () => void;
}

export function LandingEventsSection({
  events,
  includePast,
  onIncludePastChange,
  onCreateEventClick,
}: LandingEventsSectionProps) {
  const { t } = useTranslation('landing');
  const now = Date.now();

  return (
    <section className="py-20 bg-muted/30 border-y">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center mb-12 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <ShoppingBag className="w-4 h-4" />
            <span>{t('events.badge')}</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">{t('events.title')}</h2>
          <p className="text-muted-foreground">{t('events.text')}</p>

          <div className="flex items-center justify-center gap-3 pt-2">
            <div className="flex items-center space-x-2 bg-background border px-3 py-1.5 rounded-full shadow-sm">
              <Checkbox
                id="include-past"
                checked={includePast}
                onCheckedChange={(checked) => onIncludePastChange(!!checked)}
              />
              <Label htmlFor="include-past" className="cursor-pointer text-xs font-medium">
                {t('events.showPast')}
              </Label>
            </div>
          </div>
        </div>

        {events === undefined ? (
          <Loading className="max-w-7xl mx-auto md:px-8">
            <CardGridSkeleton count={3} />
          </Loading>
        ) : events.length > 0 ? (
          <div className="max-w-7xl mx-auto md:px-8">
            {/* A new row with the toggle: a snapping row would stay on the card it showed */}
            <ScrollRow
              key={String(includePast)}
              contentKey={events.length}
              className="items-stretch gap-6 scroll-px-2 px-2 pb-6"
            >
              {events.map((event) => {
                const isPast = event.endDate ? event.endDate < now : event.startDate < now;
                return (
                  <Link
                    key={event._id}
                    to={`/public-events/${event._id}`}
                    state={{ from: '/' }}
                    data-landing-event-card
                    className={`snap-start shrink-0 w-[85%] sm:w-[70%] md:w-[45%] lg:w-[35%] xl:w-[30%] bg-card rounded-xl border overflow-hidden hover:shadow-md hover:border-primary/40 transition-all flex flex-col self-stretch ${isPast ? 'opacity-75 grayscale-[0.5]' : ''}`}
                  >
                    <div className="aspect-[16/10] overflow-hidden relative border-b">
                      <ImageWithFallback
                        storageId={event.coverImage}
                        alt={event.title}
                        className="w-full h-full object-cover"
                      />
                      {isPast && (
                        <div className="absolute top-3 right-3 bg-muted/90 backdrop-blur-sm text-muted-foreground px-2 py-1 rounded text-[10px] font-bold border border-border">
                          {t('events.ended')}
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
                          <span className="text-foreground line-clamp-1">
                            {formatEventPlace(event)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </ScrollRow>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 rounded-3xl border bg-card p-6 text-center shadow-sm sm:flex-row sm:p-8 sm:text-left">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Calendar className="h-7 w-7" />
            </span>
            <div className="flex-1 space-y-1">
              <h3 className="text-lg font-bold">
                {includePast ? t('events.emptyPast') : t('events.empty')}
              </h3>
              <p className="text-sm text-muted-foreground">{t('events.emptyText')}</p>
            </div>
            <Button className="shrink-0" onClick={onCreateEventClick}>
              {t('events.create')}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
