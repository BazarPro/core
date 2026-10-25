import {
  ArrowRight,
  Bike,
  BookOpen,
  Baby,
  Calculator,
  Handshake,
  Languages,
  Radio,
  ScanLine,
  ShieldCheck,
  Shirt,
  Snowflake,
  Tag,
  ToyBrick,
  UserCheck,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import { useMemo } from 'react';
import { Footer } from '../../../components/layout/Footer';
import { Seo } from '../../../components/seo/Seo';
import { Button } from '../../../components/ui/button';
import { docsUrl } from '../../../lib/links';
import { softwareApplication } from '../../../lib/structuredData';
import { LandingCTA } from '../landing/components/LandingCTA';
import { LandingFeatures } from '../landing/components/LandingFeatures';
import { MarketingHero, SectionHeading } from './components/MarketingHero';
import { OpenSourceSection } from './components/OpenSourceSection';
import { useStartActions } from './components/useStartActions';
import { Trans, useTranslation } from 'react-i18next';

interface Highlight {
  icon: LucideIcon;
  id:
    | 'wizard'
    | 'qrLabels'
    | 'phoneCheckout'
    | 'settlement'
    | 'live'
    | 'registration'
    | 'negotiate'
    | 'proof'
    | 'languages';
}

const HIGHLIGHTS: Highlight[] = [
  {
    icon: WandSparkles,
    id: 'wizard',
  },
  {
    icon: Tag,
    id: 'qrLabels',
  },
  {
    icon: ScanLine,
    id: 'phoneCheckout',
  },
  {
    icon: Calculator,
    id: 'settlement',
  },
  {
    icon: Radio,
    id: 'live',
  },
  {
    icon: UserCheck,
    id: 'registration',
  },
  {
    icon: Handshake,
    id: 'negotiate',
  },
  {
    icon: ShieldCheck,
    id: 'proof',
  },
  {
    icon: Languages,
    id: 'languages',
  },
];

const BAZAAR_TYPES: {
  icon: LucideIcon;
  id: 'kids' | 'bikes' | 'toys' | 'ski' | 'fleaMarket' | 'books';
  /** Guide in the documentation */
  guide?: string;
}[] = [
  { icon: Baby, id: 'kids', guide: '/ratgeber/kinderbasar-organisieren/' },
  { icon: Bike, id: 'bikes', guide: '/ratgeber/fahrradboerse-organisieren/' },
  { icon: ToyBrick, id: 'toys' },
  { icon: Snowflake, id: 'ski' },
  { icon: Shirt, id: 'fleaMarket' },
  { icon: BookOpen, id: 'books' },
];

const FEATURE_LIST = [
  'wizard',
  'registration',
  'listing',
  'labels',
  'scan',
  'cart',
  'offline',
  'discounts',
  'offers',
  'questions',
  'categoryFields',
  'requiredFields',
  'walkIn',
  'notes',
  'emails',
  'reminders',
  'broadcasts',
  'map',
  'settlement',
  'intakeFee',
  'pickupPass',
  'proof',
  'languages',
] as const;

export function FeaturesPage() {
  const { isAuthenticated, goToOrganizer, goToSeller } = useStartActions();
  const { t, i18n } = useTranslation(['company', 'landing']);
  const jsonLd = useMemo(
    () => softwareApplication(FEATURE_LIST.map((id) => t(`featuresPage.list.${id}`))),
    [t]
  );

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background">
      <Seo
        title={t('featuresPage.seoTitle')}
        description={t('featuresPage.seoDescription')}
        canonical="/features"
        jsonLd={jsonLd}
      />

      <main className="flex-grow">
        <MarketingHero
          eyebrow={t('featuresPage.eyebrow')}
          title={
            <Trans
              i18nKey="featuresPage.title"
              ns="company"
              components={{ highlight: <span className="text-primary" /> }}
            />
          }
          actions={
            <Button
              size="lg"
              className="group h-12 px-6 text-base font-semibold"
              onClick={goToOrganizer}
            >
              {isAuthenticated ? t('landing:actions.myEvents') : t('start')}
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
          }
        >
          {t('featuresPage.intro')}
        </MarketingHero>

        {/* Highlights */}
        <section className="pb-20 sm:pb-24">
          <div className="container mx-auto grid max-w-6xl gap-4 px-4 sm:grid-cols-2 lg:grid-cols-3">
            {HIGHLIGHTS.map(({ icon: Icon, id }) => (
              <div
                key={id}
                className="group rounded-[1.5rem] border bg-card p-6 shadow-sm transition-shadow hover:shadow-lg sm:p-7"
              >
                <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="h-6 w-6" />
                </span>
                <h2 className="mb-2 text-xl font-bold">
                  {t(`featuresPage.highlights.${id}.title`)}
                </h2>
                <p className="text-pretty leading-relaxed text-muted-foreground">
                  {t(`featuresPage.highlights.${id}.text`)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Use cases */}
        <section className="pb-20 sm:pb-24">
          <div className="container mx-auto px-4">
            <SectionHeading
              eyebrow={t('featuresPage.useCases.eyebrow')}
              title={t('featuresPage.useCases.title')}
            >
              {t('featuresPage.useCases.text')}
            </SectionHeading>
            <ul className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {BAZAAR_TYPES.map(({ icon: Icon, id, guide }) => (
                <li key={id} className="flex flex-col rounded-2xl border bg-card p-5 shadow-sm">
                  <h3 className="mb-2 flex items-center gap-3 font-semibold">
                    <Icon className="h-5 w-5 shrink-0 text-primary" />
                    {t(`featuresPage.bazaarTypes.${id}.title`)}
                  </h3>
                  <p className="text-pretty text-sm text-muted-foreground">
                    {t(`featuresPage.bazaarTypes.${id}.text`)}
                  </p>
                  {guide && (
                    <a
                      href={docsUrl(i18n.resolvedLanguage, guide)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      {t('featuresPage.useCases.guide')}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <LandingFeatures />

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
