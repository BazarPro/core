import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { SortMarkBadge } from '../../../../components/sellers/SortMarkBadge';
import { Button } from '../../../../components/ui/button';
import { useLocalizedPath } from '../../../../i18n/useLocale';
import { SORT_COLORS } from '../../../../shared/sortCode';

/** Piles after a bazaar: the digit of the pile and the marks of labels lying on it */
const PILES = [
  { pile: 3, codes: [66_643, 81_253, 70_033] },
  { pile: 7, codes: [40_517, 51_337] },
  { pile: 1, codes: [12_391, 22_221, 90_481] },
];

/** Universal labels in short, with the way to the page that explains them with a game. */
export function LandingLabels() {
  const { t } = useTranslation('company');
  const localized = useLocalizedPath();
  return (
    <section className="py-20 sm:py-24">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="grid items-center gap-10 overflow-hidden rounded-[2rem] border bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-10 lg:grid-cols-2 lg:gap-14">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">
              {t('labelsPage.teaser.eyebrow')}
            </p>
            <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              {t('labelsPage.teaser.title')}
            </h2>
            <p className="text-pretty text-lg text-muted-foreground">
              {t('labelsPage.teaser.text')}
            </p>
            <Button asChild size="lg" className="group">
              <Link to={localized('/labels')}>
                {t('labelsPage.teaser.cta')}
                <ArrowRight className="transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
          </div>
          {/* Three piles, each under its large digit */}
          <div
            aria-hidden="true"
            className="grid grid-cols-3 items-end gap-3 max-lg:order-first sm:gap-5"
          >
            {PILES.map(({ pile, codes }) => {
              const color = SORT_COLORS[pile];
              return (
                <div key={pile} className="flex flex-col items-center gap-3">
                  {/* A pile: the top label readable, the ones below only by their edges */}
                  <div className="relative w-full pb-3">
                    {codes.slice(1).map((code, index) => (
                      <div
                        key={code}
                        className="absolute inset-0 mx-auto w-[92%] rounded-md bg-white shadow ring-1 ring-black/10"
                        style={{
                          transform: `translateY(${(index + 1) * 5}px) rotate(${[4, -3][index]}deg)`,
                        }}
                      />
                    ))}
                    <div className="relative mx-auto w-[92%] -rotate-2 rounded-md bg-white p-1 shadow-md ring-1 ring-black/10">
                      <SortMarkBadge code={codes[0]} className="h-auto w-full" />
                    </div>
                  </div>
                  <span
                    className="flex size-14 items-center justify-center rounded-2xl font-display text-3xl font-extrabold shadow-md sm:size-16"
                    style={{
                      background: `rgb(${color.fill.join(' ')})`,
                      color: `rgb(${color.ink.join(' ')})`,
                    }}
                  >
                    {pile}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
