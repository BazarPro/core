import {
  ArrowRight,
  Bike,
  BookOpen,
  Baby,
  Calculator,
  Map as MapIcon,
  Radio,
  ScanLine,
  Shirt,
  Snowflake,
  Tag,
  ToyBrick,
  UserCheck,
  type LucideIcon,
} from 'lucide-react';
import { useMemo } from 'react';
import { Footer } from '../../../components/layout/Footer';
import { Seo } from '../../../components/seo/Seo';
import { Button } from '../../../components/ui/button';
import { softwareApplication } from '../../../lib/structuredData';
import { LandingCTA } from '../landing/components/LandingCTA';
import { LandingFeatures } from '../landing/components/LandingFeatures';
import { MarketingHero, SectionHeading } from './components/MarketingHero';
import { OpenSourceSection } from './components/OpenSourceSection';
import { useStartActions } from './components/useStartActions';

interface Highlight {
  icon: LucideIcon;
  title: string;
  text: string;
}

const HIGHLIGHTS: Highlight[] = [
  {
    icon: Tag,
    title: 'QR-Etiketten ohne Preis',
    text: 'Verkäufer drucken die Etiketten selbst als PDF. Weil kein Preis draufsteht, sind Rabatte während des Basars ohne Neudruck möglich.',
  },
  {
    icon: ScanLine,
    title: 'Kasse auf dem Smartphone',
    text: 'Warenannahme und Verkauf laufen über die Handykamera im Browser. Eine Kasse, Scanner oder App sind nicht nötig.',
  },
  {
    icon: Calculator,
    title: 'Abrechnung auf Knopfdruck',
    text: 'Umsatz, Provision und Auszahlung stehen für jeden Verkäufer fest – ohne Listen und Nachzählen.',
  },
  {
    icon: Radio,
    title: 'Live für Verkäufer',
    text: 'Verkäufer sehen sofort, was verkauft ist, und können laufenden Artikeln einen Rabatt geben.',
  },
  {
    icon: MapIcon,
    title: 'Lageplan & Standorte',
    text: 'Besucher scannen einen Artikel und sehen Preis und Standort, z. B. „Halle B, Tisch 4“.',
  },
  {
    icon: UserCheck,
    title: 'Anmeldung im Griff',
    text: 'Zugangscode, Teilnehmerlimit, erlaubte Kategorien und Co-Organisatoren für dein Helferteam.',
  },
];

const BAZAAR_TYPES: { icon: LucideIcon; label: string }[] = [
  { icon: Baby, label: 'Kinderkleiderbasar' },
  { icon: Bike, label: 'Fahrradbörse' },
  { icon: ToyBrick, label: 'Spielzeugbasar' },
  { icon: Snowflake, label: 'Ski- und Wintersportbasar' },
  { icon: Shirt, label: 'Second-Hand-Flohmarkt' },
  { icon: BookOpen, label: 'Bücherflohmarkt' },
];

const FEATURE_LIST = [
  'Online-Anmeldung von Verkäufern mit Zugangscode und Teilnehmerlimit',
  'Artikel mit Foto und Preis online erfassen',
  'QR-Code-Etiketten als PDF',
  'Warenannahme und Kasse per Smartphone-Scan',
  'Rabatte während des Basars',
  'Lageplan und Standorte',
  'Automatische Abrechnung mit Provision',
  'Digitaler Abholausweis für Verkäufer',
];

export function FeaturesPage() {
  const { isAuthenticated, goToOrganizer, goToSeller } = useStartActions();
  const jsonLd = useMemo(() => softwareApplication(FEATURE_LIST), []);

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background">
      <Seo
        title="Funktionen – Basar-Software mit QR-Etiketten und Smartphone-Kasse | BazarPro"
        description="Verkäuferanmeldung, QR-Etiketten, Warenannahme und Kasse per Smartphone, automatische Abrechnung: alle Funktionen für Kinderkleiderbasar, Fahrradbörse und Flohmarkt."
        canonical="/features"
        jsonLd={jsonLd}
      />

      <main className="flex-grow">
        <MarketingHero
          eyebrow="Funktionen"
          title={
            <>
              Alles für deinen Basar – <span className="text-primary">in einer App</span>
            </>
          }
          actions={
            <Button
              size="lg"
              className="group h-12 px-6 text-base font-semibold"
              onClick={goToOrganizer}
            >
              {isAuthenticated ? 'Meine Veranstaltungen' : 'Kostenlos starten'}
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
          }
        >
          Von der Anmeldung der Verkäufer über die Kasse bis zur Auszahlung: BazarPro ersetzt
          Zettellisten, handgeschriebene Etiketten und das Nachzählen am Abend.
        </MarketingHero>

        {/* Highlights */}
        <section className="pb-20 sm:pb-24">
          <div className="container mx-auto grid max-w-6xl gap-4 px-4 sm:grid-cols-2 lg:grid-cols-3">
            {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
              <div
                key={title}
                className="group rounded-[1.5rem] border bg-card p-6 shadow-sm transition-shadow hover:shadow-lg sm:p-7"
              >
                <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="h-6 w-6" />
                </span>
                <h2 className="mb-2 text-xl font-bold">{title}</h2>
                <p className="text-pretty leading-relaxed text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Use cases */}
        <section className="pb-20 sm:pb-24">
          <div className="container mx-auto px-4">
            <SectionHeading eyebrow="Einsatzbereiche" title="Für jeden Second-Hand-Basar">
              Überall, wo Verkäufer ihre Sachen abgeben und ein Team sie verkauft.
            </SectionHeading>
            <ul className="mx-auto grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-3">
              {BAZAAR_TYPES.map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="flex items-center gap-3 rounded-2xl border bg-card p-4 font-semibold shadow-sm"
                >
                  <Icon className="h-5 w-5 shrink-0 text-primary" />
                  <span className="min-w-0">{label}</span>
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
