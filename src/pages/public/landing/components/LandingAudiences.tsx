import { ArrowRight, Calendar, Check, ShoppingBag, type LucideIcon } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { cn } from '../../../../lib/utils';

interface Audience {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  benefits: string[];
  cta: string;
  onClick: () => void;
  highlighted?: boolean;
}

interface LandingAudiencesProps {
  onOrganizerClick: () => void;
  onSellerClick: () => void;
}

export function LandingAudiences({ onOrganizerClick, onSellerClick }: LandingAudiencesProps) {
  const audiences: Audience[] = [
    {
      icon: Calendar,
      eyebrow: 'Für Veranstalter',
      title: 'Weniger Orga, mehr Basar',
      benefits: [
        'Verkäuferanmeldung mit Teilnehmerlimit und Zugangscode',
        'Kasse per Smartphone – mehrere Helfer gleichzeitig',
        'Provision und Auszahlungen automatisch berechnet',
        'Live-Überblick über Umsatz und Verkäufer',
      ],
      cta: 'Basar organisieren',
      onClick: onOrganizerClick,
      highlighted: true,
    },
    {
      icon: ShoppingBag,
      eyebrow: 'Für Verkäufer',
      title: 'Ausmisten, ohne Etiketten zu schreiben',
      benefits: [
        'Artikel einmal erfassen und bei mehreren Basaren anbieten',
        'QR-Etiketten fertig zum Ausdrucken',
        'Live sehen, was schon verkauft ist',
        'Transparente Abrechnung nach dem Basar',
      ],
      cta: 'Als Verkäufer mitmachen',
      onClick: onSellerClick,
    },
  ];

  return (
    <section className="bg-muted/30 py-20 sm:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-12 max-w-2xl space-y-4 text-center">
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            Eine Plattform, zwei Seiten
          </h2>
          <p className="text-pretty text-lg text-muted-foreground">
            Veranstalter behalten den Überblick, Verkäufer sparen sich die Handarbeit.
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2">
          {audiences.map((audience) => (
            <div
              key={audience.eyebrow}
              className={cn(
                'flex flex-col rounded-[2rem] border bg-card p-6 shadow-sm sm:p-8',
                audience.highlighted && 'border-primary/40 shadow-xl shadow-primary/5'
              )}
            >
              <div className="mb-6 flex items-center gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <audience.icon className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-primary">{audience.eyebrow}</p>
                  <h3 className="text-xl font-bold leading-snug sm:text-2xl">{audience.title}</h3>
                </div>
              </div>
              <ul className="mb-8 flex-1 space-y-3">
                {audience.benefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-3 text-muted-foreground">
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
              <Button
                size="lg"
                variant={audience.highlighted ? 'default' : 'outline'}
                className="group h-12 w-full text-base font-semibold"
                onClick={audience.onClick}
              >
                {audience.cta}
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
