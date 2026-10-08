import { ArrowRight, Calendar, ShoppingBag } from 'lucide-react';
import { Button } from '../../../../components/ui/button';

interface LandingCTAProps {
  isAuthenticated: boolean;
  onOrganizerClick: () => void;
  onSellerClick: () => void;
}

export function LandingCTA({ isAuthenticated, onOrganizerClick, onSellerClick }: LandingCTAProps) {
  return (
    <section className="relative isolate overflow-hidden bg-primary py-20 sm:py-24">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-1/4 -top-1/2 h-full w-3/4 rounded-full bg-white/10 blur-[120px]" />
        <div className="absolute -bottom-1/2 -right-1/4 h-full w-3/4 rounded-full bg-black/20 blur-[120px]" />
      </div>

      <div className="container mx-auto max-w-3xl space-y-8 px-4 text-center">
        <h2 className="text-balance text-3xl font-bold leading-tight tracking-tight text-primary-foreground sm:text-4xl md:text-5xl">
          Bereit für deinen nächsten Basar?
        </h2>
        <p className="text-pretty text-lg text-primary-foreground/80 sm:text-xl">
          Leg deinen Basar an oder melde dich als Verkäufer – kostenlos.
        </p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button
            size="lg"
            className="group h-12 border-none bg-white px-6 text-base font-semibold text-primary hover:bg-white/90"
            onClick={onOrganizerClick}
          >
            <Calendar className="mr-2 h-5 w-5" />
            {isAuthenticated ? 'Meine Veranstaltungen' : 'Basar organisieren'}
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-12 border-primary-foreground/30 bg-primary-foreground/5 px-6 text-base font-semibold text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            onClick={onSellerClick}
          >
            <ShoppingBag className="mr-2 h-5 w-5" />
            {isAuthenticated ? 'Meine Artikel' : 'Als Verkäufer mitmachen'}
          </Button>
        </div>
        <p className="text-sm text-primary-foreground/70">
          BazarPro ist Open Source (MIT) –{' '}
          <a
            href="https://github.com/BazarPro/core"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary-foreground underline underline-offset-4 hover:no-underline"
          >
            Code auf GitHub
          </a>
        </p>
      </div>
    </section>
  );
}
