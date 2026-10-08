import { ArrowRight, Calendar, Check, ShoppingBag } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { HeroSaleDemo } from './demo/HeroSaleDemo';

interface LandingHeroProps {
  isAuthenticated: boolean;
  onOrganizerClick: () => void;
  onSellerClick: () => void;
  onEventsClick: () => void;
}

const highlights = [
  'Open Source & kostenlos',
  'Keine Kassenhardware nötig',
  'Abrechnung auf Knopfdruck',
];

export function LandingHero({
  isAuthenticated,
  onOrganizerClick,
  onSellerClick,
  onEventsClick,
}: LandingHeroProps) {
  return (
    <section className="relative isolate overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl lg:left-1/4" />
        <div className="absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      </div>

      <div className="container mx-auto grid items-center gap-12 px-4 py-12 sm:py-16 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:py-24">
        <div className="mx-auto max-w-2xl space-y-7 text-center lg:mx-0 lg:text-left">
          <p className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-sm font-medium text-muted-foreground shadow-sm backdrop-blur">
            <ShoppingBag className="h-4 w-4 text-primary" />
            <span className="sm:hidden">Für Basare & Flohmärkte</span>
            <span className="hidden sm:inline">Für Kinderbasare, Fahrradbörsen & Flohmärkte</span>
          </p>

          <h1 className="text-balance text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
            Second‑Hand‑Basare organisieren –{' '}
            <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              ohne Zettelwirtschaft
            </span>
          </h1>

          <p className="text-pretty text-lg text-muted-foreground sm:text-xl">
            Verkäufer erfassen ihre Artikel online und drucken QR-Etiketten. An der Kasse wird per
            Smartphone gescannt – Umsätze, Provisionen und Auszahlungen berechnet BazarPro
            automatisch.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <Button
              size="lg"
              className="group h-12 px-6 text-base font-semibold"
              onClick={onOrganizerClick}
            >
              <Calendar className="mr-2 h-5 w-5" />
              {isAuthenticated ? 'Meine Veranstaltungen' : 'Basar organisieren'}
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 bg-background/80 px-6 text-base font-semibold"
              onClick={onSellerClick}
            >
              <ShoppingBag className="mr-2 h-5 w-5" />
              {isAuthenticated ? 'Meine Artikel' : 'Als Verkäufer mitmachen'}
            </Button>
          </div>

          <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground lg:justify-start">
            {highlights.map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                {item}
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={onEventsClick}
            className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            Aktuelle Basare in deiner Nähe ansehen ↓
          </button>
        </div>

        <HeroSaleDemo />
      </div>
    </section>
  );
}
