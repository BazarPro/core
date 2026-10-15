import { ArrowRight, Check, Cloud, Server } from 'lucide-react';
import { useMemo } from 'react';
import { Footer } from '../../../components/layout/Footer';
import { Seo } from '../../../components/seo/Seo';
import { Button } from '../../../components/ui/button';
import { SELFHOST_URL } from '../../../lib/links';
import { faqPage, softwareApplication } from '../../../lib/structuredData';
import { LandingCTA } from '../landing/components/LandingCTA';
import { MarketingHero, SectionHeading } from './components/MarketingHero';
import { OpenSourceSection } from './components/OpenSourceSection';
import { useStartActions } from './components/useStartActions';
import { Trans, useTranslation } from 'react-i18next';

const HOSTED_FEATURES = ['unlimited', 'labels', 'settlement', 'instant'] as const;

const SELFHOSTED_FEATURES = ['allFeatures', 'ownData', 'ownDomain', 'docker'] as const;

const FAQ = ['free', 'commission', 'hardware', 'selfHost'] as const;

export function PricingPage() {
  const { isAuthenticated, goToOrganizer, goToSeller } = useStartActions();
  const { t } = useTranslation(['company', 'landing']);
  const jsonLd = useMemo(
    () => [
      softwareApplication(),
      faqPage(
        FAQ.map((id) => ({
          question: t(`pricing.faq.items.${id}.question`),
          answer: t(`pricing.faq.items.${id}.answer`),
        }))
      ),
    ],
    [t]
  );

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background">
      <Seo
        title={t('pricing.seoTitle')}
        description={t('pricing.seoDescription')}
        canonical="/pricing"
        jsonLd={jsonLd}
      />

      <main className="flex-grow">
        <MarketingHero
          eyebrow={t('pricing.eyebrow')}
          title={
            <Trans
              i18nKey="pricing.title"
              ns="company"
              components={{ highlight: <span className="text-primary" /> }}
            />
          }
        >
          {t('pricing.intro')}
        </MarketingHero>

        <section className="pb-20 sm:pb-24">
          <div className="container mx-auto grid max-w-5xl gap-6 px-4 md:grid-cols-2">
            <PlanCard
              icon={Cloud}
              name="bazarpro.de"
              tagline={t('pricing.hosted.tagline')}
              priceNote={t('pricing.hosted.priceNote')}
              features={HOSTED_FEATURES.map((id) => t(`pricing.hosted.features.${id}`))}
              highlighted
              action={
                <Button
                  size="lg"
                  className="group h-12 w-full text-base font-semibold"
                  onClick={goToOrganizer}
                >
                  {isAuthenticated ? t('landing:actions.myEvents') : t('pricing.hosted.register')}
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              }
            />
            <PlanCard
              icon={Server}
              name={t('pricing.selfHosted.name')}
              tagline={t('pricing.selfHosted.tagline')}
              priceNote={t('pricing.selfHosted.priceNote')}
              features={SELFHOSTED_FEATURES.map((id) => t(`pricing.selfHosted.features.${id}`))}
              action={
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 w-full text-base font-semibold"
                >
                  <a href={SELFHOST_URL} target="_blank" rel="noopener noreferrer">
                    {t('pricing.selfHosted.guide')}
                  </a>
                </Button>
              }
            />
          </div>
        </section>

        <section className="bg-muted/40 py-20 sm:py-24">
          <div className="container mx-auto px-4">
            <SectionHeading eyebrow={t('pricing.faq.eyebrow')} title={t('pricing.faq.title')} />
            <div className="mx-auto max-w-3xl space-y-3">
              {FAQ.map((id) => (
                <details
                  key={id}
                  className="group rounded-2xl border bg-card p-5 shadow-sm open:shadow-md sm:p-6"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                    <h3>{t(`pricing.faq.items.${id}.question`)}</h3>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
                    {t(`pricing.faq.items.${id}.answer`)}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <OpenSourceSection />

        <LandingCTA
          isAuthenticated={isAuthenticated}
          onOrganizerClick={goToOrganizer}
          onSellerClick={goToSeller}
        />
      </main>

      <Footer />
    </div>
  );
}

function PlanCard({
  icon: Icon,
  name,
  tagline,
  priceNote,
  features,
  action,
  highlighted = false,
}: {
  icon: typeof Cloud;
  name: string;
  tagline: string;
  priceNote: string;
  features: string[];
  action: React.ReactNode;
  highlighted?: boolean;
}) {
  return (
    <div
      className={
        highlighted
          ? 'flex flex-col rounded-[2rem] border-2 border-primary bg-card p-7 shadow-xl sm:p-9'
          : 'flex flex-col rounded-[2rem] border bg-card p-7 shadow-sm sm:p-9'
      }
    >
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-xl font-bold">{name}</h2>
          <p className="text-sm text-muted-foreground">{tagline}</p>
        </div>
      </div>
      <p className="mb-6 text-5xl font-extrabold tracking-tight">
        0 €<span className="ml-2 text-base font-normal text-muted-foreground">{priceNote}</span>
      </p>
      <ul className="mb-8 space-y-3">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto">{action}</div>
    </div>
  );
}
