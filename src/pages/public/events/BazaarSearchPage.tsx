import { useTranslation } from 'react-i18next';
import { Footer } from '../../../components/layout/Footer';
import { Seo } from '../../../components/seo/Seo';
import {
  BazaarFilters,
  BazaarResultCard,
  BazaarResultsHeading,
  BazaarSearchBar,
  BazaarSearchEmpty,
} from '../../../components/events/BazaarSearch';
import { useBazaarSearch } from '../../../hooks/useBazaarSearch';
import { CardGridSkeleton, Loading } from '../../../components/ui/loading';
import { usePublicQuery } from '../../../hooks/usePublicQuery';
import { api } from '../../../lib/api/functions';
import type { Doc } from '../../../lib/api/types';
import { useStartActions } from '../company/components/useStartActions';

/**
 * Bazaars around a postal code or town for visitors, with the conditions sellers care
 * about. Signed in, the same search sits on /browse-events, with joining.
 */
export function BazaarSearchPage() {
  const { t } = useTranslation('events');
  const events = usePublicQuery(api.events.get, { includePast: true });
  const categories = usePublicQuery(api.categories.getAllCategories, {});
  const search = useBazaarSearch(events as Doc<'events'>[] | undefined, categories);
  const { goToOrganizer } = useStartActions();

  return (
    <div className="min-h-screen bg-background">
      <Seo title={t('finder.title')} description={t('finder.lead')} canonical="/bazaars" />
      <section className="relative isolate border-b bg-gradient-to-b from-primary/10 to-transparent">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_90%)]" />
        <div className="mx-auto max-w-5xl px-4 pb-6 pt-10 sm:pt-14">
          <h1 className="text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
            {t('finder.title')}
          </h1>
          <p className="mt-2 max-w-2xl text-pretty text-lg text-muted-foreground">
            {t('finder.lead')}
          </p>
          <BazaarSearchBar search={search} className="mt-6" />
          <BazaarFilters search={search} categories={categories} />
        </div>
      </section>

      <section aria-labelledby="bazaar-results" className="mx-auto max-w-5xl space-y-4 px-4 py-8">
        {search.results === undefined ? (
          <Loading>
            <CardGridSkeleton count={3} className="gap-5 sm:grid-cols-2 lg:grid-cols-3" />
          </Loading>
        ) : (
          <>
            <BazaarResultsHeading search={search} id="bazaar-results" />
            {search.results.length > 0 ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {search.results.map((found) => (
                  <BazaarResultCard
                    key={found.event._id}
                    found={found}
                    from={`/bazaars${window.location.search}`}
                  />
                ))}
              </div>
            ) : (
              <BazaarSearchEmpty search={search} onOrganize={goToOrganizer} />
            )}
          </>
        )}
      </section>
      <Footer />
    </div>
  );
}
