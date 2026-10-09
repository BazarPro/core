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
    <section className="relative isolate flex items-center overflow-hidden lg:min-h-[calc(100svh-4rem)]">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl lg:left-1/4" />
        <div className="absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      </div>

      <div className="container mx-auto grid items-center gap-10 px-4 py-14 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12 lg:py-16">
        <div className="mx-auto max-w-2xl space-y-6 text-center lg:mx-0 lg:text-left">
          <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl xl:text-[3.4rem]">
            <span className="whitespace-nowrap">
              Second{'‑'}Hand{'‑'}Basare
            </span>
            <br />
            <span className="relative inline-block text-primary">
              ohne
              <svg
                aria-hidden="true"
                viewBox="0 0 120 12"
                preserveAspectRatio="none"
                className="absolute -bottom-1.5 left-0 h-2.5 w-full text-primary/60"
              >
                <path
                  d="M2 8 C30 2 60 2 118 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              </svg>
            </span>{' '}
            Zettelwirtschaft
          </h1>

          <p className="text-pretty text-lg text-muted-foreground sm:text-xl lg:text-[1.3rem] lg:leading-relaxed">
            <span className="block">
              Verkäufer inserieren zu Hause{' '}
              <span className="whitespace-nowrap">und hängen einen QR{'‑'}Code dran.</span>
            </span>
            <span className="mt-1 block">
              Beim Basar wird nur noch gescannt –{' '}
              <span className="whitespace-nowrap">den Rest rechnet BazarPro.</span>
            </span>
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
