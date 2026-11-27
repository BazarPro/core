import { ArrowRight, Calendar, Tag } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useLocalizedPath } from '../../../../i18n/useLocale';

interface LandingCTAProps {
  isAuthenticated: boolean;
  onOrganizerClick: () => void;
  onSellerClick: () => void;
}

export function LandingCTA({ isAuthenticated, onOrganizerClick, onSellerClick }: LandingCTAProps) {
  const { t } = useTranslation('landing');
  const localized = useLocalizedPath();
  // Dark petrol in both themes: white text and the yellow button read the same everywhere
  return (
    <section className="relative isolate overflow-hidden bg-brand-panel py-20 text-white sm:py-24">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.08)_1.5px,transparent_1.5px)] [background-size:22px_22px]" />
      </div>

      <div className="container mx-auto max-w-3xl space-y-8 px-4 text-center">
        <h2 className="text-balance text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl md:text-5xl">
          {t('cta.title')}
        </h2>
        <p className="text-pretty text-lg text-white/85 sm:text-xl">{t('cta.text')}</p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button
            size="lg"
            // White on the blue panel: yellow is for what is due now, not for a main button
            className="group h-12 border-none bg-white px-6 text-base font-semibold text-slate-900 shadow-[0_2px_0_rgba(0,0,0,0.25)] hover:bg-white/90"
            onClick={onOrganizerClick}
          >
            <Calendar className="mr-2 h-5 w-5" />
            {isAuthenticated ? t('actions.myEvents') : t('actions.organize')}
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-12 border-white/40 bg-white/10 px-6 text-base font-semibold text-white hover:bg-white/20 hover:text-white dark:border-white/40 dark:bg-white/10 dark:hover:bg-white/20"
            onClick={onSellerClick}
          >
            <Tag className="mr-2 h-5 w-5" />
            {isAuthenticated ? t('actions.myProducts') : t('actions.joinAsSeller')}
          </Button>
        </div>
        <p className="text-sm text-white/80">
          <Trans
            i18nKey="cta.openSource"
            ns="landing"
            components={{
              github: (
                <a
                  href="https://github.com/BazarPro/bazarpro"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-white underline underline-offset-4 hover:no-underline"
                />
              ),
              about: (
                <Link
                  to={localized('/about')}
                  className="font-semibold text-white underline underline-offset-4 hover:no-underline"
                />
              ),
            }}
          />
        </p>
      </div>
    </section>
  );
}
