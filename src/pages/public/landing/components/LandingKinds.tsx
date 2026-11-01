import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ItemPhoto } from '../../../../components/illustrations/ItemIllustrations';
import { EVENT_TYPES } from '../../../../lib/eventTypes';

/**
 * The kinds of bazaars BazarPro has templates for, with their typical items. A card opens
 * the creation wizard with that template, also for visitors without an account.
 */
export function LandingKinds() {
  const { t } = useTranslation(['landing', 'organizer']);
  const navigate = useNavigate();
  return (
    <section id="kinds-section" className="scroll-mt-20 bg-muted/30 py-20 sm:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-10 max-w-2xl space-y-4 text-center sm:mb-14">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            {t('landing:kinds.eyebrow')}
          </p>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            {t('landing:kinds.title')}
          </h2>
          <p className="text-pretty text-lg text-muted-foreground">{t('landing:kinds.text')}</p>
        </div>
        <div className="mx-auto grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {EVENT_TYPES.map((type) => {
            const highlights = t(`organizer:eventTypes.${type.id}.highlights`, {
              returnObjects: true,
            }) as string[];
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => navigate(`/events/new?type=${type.id}`)}
                className="group flex flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ItemPhoto
                  kind={type.item}
                  className="aspect-[16/10] transition-transform duration-300 group-hover:scale-[1.03]"
                />
                <span className="flex flex-1 flex-col gap-2 p-5">
                  <span className="text-lg font-semibold">
                    {t(`organizer:eventTypes.${type.id}.title`)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t(`organizer:eventTypes.${type.id}.text`)}
                  </span>
                  <span className="flex flex-wrap gap-1.5 pt-1">
                    {highlights.map((highlight) => (
                      <span
                        key={highlight}
                        className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                      >
                        {highlight}
                      </span>
                    ))}
                  </span>
                  <span className="mt-auto flex items-center gap-1 pt-3 text-sm font-semibold text-primary">
                    {t('landing:kinds.start')}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
