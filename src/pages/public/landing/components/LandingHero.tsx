import { ArrowRight, Calendar, ShoppingBag } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { HeroBikeDemo } from './demo/HeroBikeDemo';

interface LandingHeroProps {
  isAuthenticated: boolean;
  onOrganizerClick: () => void;
  onSellerClick: () => void;
}

export function LandingHero({
  isAuthenticated,
  onOrganizerClick,
  onSellerClick,
}: LandingHeroProps) {
  return (
    <section className="relative isolate overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl lg:left-1/4" />
        <div className="absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      </div>

      <div className="container mx-auto grid items-center gap-10 px-4 py-12 sm:py-16 lg:grid-cols-2 lg:gap-16 lg:py-24">
        <div className="mx-auto max-w-xl space-y-6 text-center lg:mx-0 lg:text-left">
          <h1 className="text-balance text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
            Second{'‑'}Hand{'‑'}Basare{' '}
            <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              ohne Zettelwirtschaft
            </span>
          </h1>

          <p className="text-pretty text-lg text-muted-foreground sm:text-xl">
            Fotografieren, inserieren, QR-Code dranhängen – beim Basar wird nur noch gescannt. Die
            Abrechnung macht BazarPro.
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
        </div>

        <HeroBikeDemo />
      </div>
    </section>
  );
}
