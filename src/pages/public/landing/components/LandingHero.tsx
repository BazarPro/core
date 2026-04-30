import { ArrowRight, Calendar, Info } from 'lucide-react';
import { Button } from '../../../../components/ui/button';

interface LandingHeroProps {
  onStartClick: () => void;
  onHowItWorksClick: () => void;
}

export function LandingHero({ onStartClick, onHowItWorksClick }: LandingHeroProps) {
  return (
    <section className="relative pt-24 pb-16 md:pt-32 md:pb-24 overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[10%] right-[-5%] w-[30%] h-[30%] bg-secondary/10 rounded-full blur-[100px]" />
      </div>

      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center text-center space-y-8 max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium animate-in fade-in slide-in-from-top-4 duration-700">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            Jetzt verfügbar: Die neue Version 1.0
          </div>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1] animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
            Basare & Flohmärkte <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
              einfach digital
            </span>
          </h1>

          <p className="text-muted-foreground text-lg md:text-xl max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
            Die Open-Source-Plattform für die moderne Organisation von Veranstaltungen. 
            Vom QR-Code Etikett bis zur automatischen Abrechnung – alles an einem Ort.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto pt-4 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
            <Button size="lg" className="h-12 px-8 text-base font-semibold group" onClick={onStartClick}>
              <Calendar className="w-5 h-5 mr-2" />
              Events entdecken
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
            <Button size="lg" variant="outline" className="h-12 px-8 text-base font-semibold" onClick={onHowItWorksClick}>
              <Info className="w-5 h-5 mr-2" />
              Wie es funktioniert
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
