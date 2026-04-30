import { ArrowRight, Github, Rocket } from 'lucide-react';
import { Button } from '../../../../components/ui/button';

interface LandingCTAProps {
  isAuthenticated: boolean;
  onCtaClick: () => void;
}

export function LandingCTA({ isAuthenticated, onCtaClick }: LandingCTAProps) {
  return (
    <section className="py-24 relative overflow-hidden isolate bg-primary">
      {/* Decorative elements with better blending */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[100%] bg-white/10 rounded-full blur-[120px] rotate-12" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[100%] bg-black/20 rounded-full blur-[120px] -rotate-12" />
      </div>

      <div className="container mx-auto px-4 text-center relative z-10">
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-foreground/10 text-primary-foreground text-sm font-medium backdrop-blur-sm border border-primary-foreground/10">
            <Rocket className="w-4 h-4" />
            <span>Jetzt durchstarten</span>
          </div>
          
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-primary-foreground leading-tight">
            Bereit für dein nächstes <br className="hidden md:block" /> erfolgreiches Event?
          </h2>
          
          <p className="text-xl text-primary-foreground/80 max-w-xl mx-auto">
            Werde Teil der BazarPro Community und erlebe, wie einfach moderne Organisation sein kann.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Button 
              size="lg" 
              variant="secondary" 
              className="h-14 px-8 text-lg font-bold shadow-xl hover:scale-105 transition-transform bg-white text-primary hover:bg-white/90 border-none"
              onClick={onCtaClick}
            >
              {isAuthenticated ? 'Zum Dashboard' : 'Jetzt kostenlos registrieren'}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            
            <Button
              size="lg"
              variant="outline"
              className="h-14 px-8 text-lg bg-primary-foreground/5 border-primary-foreground/20 hover:bg-primary-foreground/10 text-primary-foreground backdrop-blur-sm shadow-xl hover:scale-105 transition-transform"
              asChild
            >
              <a href="https://github.com/BazarPro/core" target="_blank" rel="noopener noreferrer">
                <Github className="mr-2 h-5 w-5" />
                Open Source
              </a>
            </Button>
          </div>

          <div className="pt-12 grid grid-cols-2 md:grid-cols-4 gap-8 border-t border-primary-foreground/10">
            <div className="space-y-1">
              <div className="text-3xl font-bold text-primary-foreground">100%</div>
              <div className="text-sm text-primary-foreground/60">Kostenlos</div>
            </div>
            <div className="space-y-1">
              <div className="text-3xl font-bold text-primary-foreground">MIT</div>
              <div className="text-sm text-primary-foreground/60">Lizenz</div>
            </div>
            <div className="space-y-1">
              <div className="text-3xl font-bold text-primary-foreground">GDPR</div>
              <div className="text-sm text-primary-foreground/60">Konform</div>
            </div>
            <div className="space-y-1">
              <div className="text-3xl font-bold text-primary-foreground">24/7</div>
              <div className="text-sm text-primary-foreground/60">Verfügbar</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
