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

const HOSTED_FEATURES = [
  'Unbegrenzt viele Basare und Verkäufer',
  'QR-Etiketten, Warenannahme und Kasse',
  'Automatische Abrechnung',
  'Sofort startklar – nur registrieren',
];

const SELFHOSTED_FEATURES = [
  'Alle Funktionen von bazarpro.de',
  'Deine Daten auf deinem Server',
  'Eigene Domain, z. B. basar.meinverein.de',
  'Installation mit Docker Compose',
];

const FAQ = [
  {
    question: 'Ist BazarPro wirklich kostenlos?',
    answer:
      'Ja. Alle Funktionen sind für Veranstalter, Verkäufer und Besucher kostenlos – ohne Abo, ohne Testphase und ohne Begrenzung der Basare oder Verkäufer.',
  },
  {
    question: 'Verdient BazarPro an meinem Basar mit?',
    answer:
      'Nein. Die Provision, die du als Veranstalter von den Verkäufen einbehältst, legst du selbst fest – sie bleibt vollständig bei dir.',
  },
  {
    question: 'Brauche ich eine Kasse oder einen Scanner?',
    answer:
      'Nein. Warenannahme und Verkauf laufen im Browser über die Kamera eines Smartphones oder Tablets. Etiketten druckst du auf normalem Papier.',
  },
  {
    question: 'Kann ich BazarPro auf meinem eigenen Server betreiben?',
    answer:
      'Ja. BazarPro ist Open Source unter MIT-Lizenz. Mit Docker Compose läuft es auf einem eigenen Server – die Anleitung steht in der Dokumentation unter docs.bazarpro.de.',
  },
];

export function PricingPage() {
  const { isAuthenticated, goToOrganizer, goToSeller } = useStartActions();
  const jsonLd = useMemo(() => [softwareApplication(), faqPage(FAQ)], []);

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background">
      <Seo
        title="Preise – kostenlose Basar-Software, Open Source | BazarPro"
        description="BazarPro ist kostenlos: unbegrenzte Basare und Verkäufer, keine Provision für BazarPro. Als Open Source (MIT) auch auf dem eigenen Server nutzbar."
        canonical="/pricing"
        jsonLd={jsonLd}
      />

      <main className="flex-grow">
        <MarketingHero
          eyebrow="Preise"
          title={
            <>
              Kostenlos. <span className="text-primary">Ohne Haken.</span>
            </>
          }
        >
          BazarPro kostet weder Veranstalter noch Verkäufer etwas. Nutze es direkt auf bazarpro.de
          oder betreibe es auf deinem eigenen Server.
        </MarketingHero>

        <section className="pb-20 sm:pb-24">
          <div className="container mx-auto grid max-w-5xl gap-6 px-4 md:grid-cols-2">
            <PlanCard
              icon={Cloud}
              name="bazarpro.de"
              tagline="Sofort loslegen"
              priceNote="ohne Abo"
              features={HOSTED_FEATURES}
              highlighted
              action={
                <Button
                  size="lg"
                  className="group h-12 w-full text-base font-semibold"
                  onClick={goToOrganizer}
                >
                  {isAuthenticated ? 'Meine Veranstaltungen' : 'Kostenlos registrieren'}
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              }
            />
            <PlanCard
              icon={Server}
              name="Selbst hosten"
              tagline="Open Source (MIT)"
              priceNote="nur dein Server kostet"
              features={SELFHOSTED_FEATURES}
              action={
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 w-full text-base font-semibold"
                >
                  <a href={SELFHOST_URL} target="_blank" rel="noopener noreferrer">
                    Zur Anleitung
                  </a>
                </Button>
              }
            />
          </div>
        </section>

        <section className="bg-muted/40 py-20 sm:py-24">
          <div className="container mx-auto px-4">
            <SectionHeading eyebrow="Häufige Fragen" title="Gut zu wissen" />
            <div className="mx-auto max-w-3xl space-y-3">
              {FAQ.map(({ question, answer }) => (
                <details
                  key={question}
                  className="group rounded-2xl border bg-card p-5 shadow-sm open:shadow-md sm:p-6"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                    <h3>{question}</h3>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">{answer}</p>
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
