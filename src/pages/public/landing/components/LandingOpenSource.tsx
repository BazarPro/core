import { Github, Code2, Globe, Share2 } from 'lucide-react';
import { Button } from '../../../../components/ui/button';

export function LandingOpenSource() {
  return (
    <section className="py-24 overflow-hidden isolate">
      <div className="container mx-auto px-4">
        <div className="bg-primary text-primary-foreground rounded-[2.5rem] p-8 md:p-16 relative overflow-hidden shadow-2xl shadow-primary/20">
          {/* Decorative elements - reduced z-index to stay below header if it somehow leaks, 
              though isolate on parent section should handle it */}
          <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none -z-10" />
          <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/4 w-64 h-64 bg-black/20 rounded-full blur-2xl pointer-events-none -z-10" />

          <div className="grid lg:grid-cols-2 gap-16 items-center relative z-10">
            <div className="space-y-8 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 text-white text-sm font-semibold backdrop-blur-md border border-white/10 shadow-sm mx-auto lg:mx-0">
                <Code2 className="w-4 h-4" />
                <span>Open Source Community</span>
              </div>

              <div className="space-y-4">
                <h2 className="text-3xl md:text-5xl font-bold leading-[1.1] tracking-tight">
                  Transparent. Fair. <br />
                  Für alle zugänglich.
                </h2>
                <p className="text-primary-foreground/80 text-lg md:text-xl max-w-xl mx-auto lg:mx-0 leading-relaxed">
                  BazarPro ist kein geschlossenes System. Wir glauben an die Kraft von Open Source.
                  Unser Code ist unter der MIT-Lizenz lizenziert – das bedeutet Sicherheit und Freiheit
                  für alle Nutzer.
                </p>
              </div>

              <div className="flex flex-wrap gap-4 justify-center lg:justify-start pt-2">
                <Button
                  variant="secondary"
                  size="lg"
                  className="h-14 px-8 font-bold shadow-lg"
                  asChild
                >
                  <a
                    href="https://github.com/BazarPro/core"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Github className="w-5 h-5 mr-2" />
                    Auf GitHub beitragen
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="h-14 px-8 bg-white/5 border-white/20 hover:bg-white/10 text-white backdrop-blur-sm"
                  asChild
                >
                  <a href="/about">Unsere Mission</a>
                </Button>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 md:gap-6">
              <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-8 border border-white/10 shadow-inner flex flex-col items-center lg:items-start text-center lg:text-left">
                <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mb-6">
                  <Globe className="w-6 h-6 text-white" />
                </div>
                <h4 className="text-xl font-bold mb-3">Kein Vendor-Lock-in</h4>
                <p className="text-primary-foreground/70 leading-relaxed">
                  Deine Daten gehören dir. Hosting-Unabhängigkeit ist durch Open Source garantiert.
                </p>
              </div>

              <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-8 border border-white/10 shadow-inner flex flex-col items-center lg:items-start text-center lg:text-left">
                <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mb-6">
                  <Share2 className="w-6 h-6 text-white" />
                </div>
                <h4 className="text-xl font-bold mb-3">Community-Driven</h4>
                <p className="text-primary-foreground/70 leading-relaxed">
                  Neue Features werden gemeinsam geplant und von Entwicklern weltweit umgesetzt.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
