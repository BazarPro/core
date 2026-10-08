import { Calculator, PackagePlus, Printer, ScanLine, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ComponentType } from 'react';
import { cn } from '../../../../lib/utils';
import { useInView, usePrefersReducedMotion } from '../hooks/useLandingMotion';
import { CaptureScene, PayoutScene, PrintScene, ScanScene } from './demo/ProcessVisuals';

const STEP_DURATION_MS = 5000;

interface ProcessStep {
  icon: LucideIcon;
  who: string;
  title: string;
  description: string;
  Scene: ComponentType;
}

const steps: ProcessStep[] = [
  {
    icon: PackagePlus,
    who: 'Verkäufer',
    title: 'Artikel online erfassen',
    description:
      'Verkäufer melden sich beim Basar an und legen ihre Artikel mit Foto, Preis und Kategorie bequem von zu Hause an.',
    Scene: CaptureScene,
  },
  {
    icon: Printer,
    who: 'Verkäufer',
    title: 'QR-Etiketten drucken',
    description:
      'BazarPro erzeugt für jeden Artikel ein Etikett mit QR-Code. Ausdrucken, an die Ware kleben und am Basar abgeben.',
    Scene: PrintScene,
  },
  {
    icon: ScanLine,
    who: 'Veranstalter',
    title: 'Scannen & verkaufen',
    description:
      'An der Kasse scannen Helfer die Etiketten mit dem Smartphone. Jeder Artikel ist sofort als verkauft markiert – Verkäufer sehen das live.',
    Scene: ScanScene,
  },
  {
    icon: Calculator,
    who: 'Automatisch',
    title: 'Abrechnung auf Knopfdruck',
    description:
      'Nach dem Basar stehen Umsatz, Provision und Auszahlung für jeden Verkäufer fest. Kein Nachzählen, keine Listen.',
    Scene: PayoutScene,
  },
];

export function LandingProcess() {
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [manual, setManual] = useState(false);
  const { ref, inView } = useInView<HTMLDivElement>(0.4);
  const reducedMotion = usePrefersReducedMotion();
  const autoplay = inView && !hovered && !manual && !reducedMotion;

  useEffect(() => {
    if (!autoplay) return;
    const timer = window.setTimeout(
      () => setActive((current) => (current + 1) % steps.length),
      STEP_DURATION_MS
    );
    return () => window.clearTimeout(timer);
  }, [autoplay, active]);

  const { Scene } = steps[active];

  return (
    <section id="process-section" className="scroll-mt-20 py-20 sm:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-12 max-w-2xl space-y-4 text-center sm:mb-16">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            So funktioniert der Verkauf
          </p>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            Vom Kleiderschrank bis zur Auszahlung
          </h2>
          <p className="text-pretty text-lg text-muted-foreground">
            Vier Schritte, die beim klassischen Basar Stunden an Handarbeit kosten – mit BazarPro
            laufen sie digital.
          </p>
        </div>

        <div
          ref={ref}
          className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
        >
          <div
            aria-hidden="true"
            className="relative order-first flex min-h-[25rem] items-center justify-center rounded-[2rem] bg-gradient-to-br from-primary/10 via-muted/40 to-transparent p-4 sm:min-h-[27rem] sm:p-8 lg:order-last"
          >
            {/* key remounts the scene so its animations replay */}
            <div key={active} className="landing-fade-up flex w-full justify-center">
              <Scene />
            </div>
          </div>

          <ol className="space-y-3">
            {steps.map((step, index) => {
              const isActive = index === active;
              return (
                <li key={step.title}>
                  <button
                    type="button"
                    aria-current={isActive ? 'step' : undefined}
                    onClick={() => {
                      setActive(index);
                      setManual(true);
                    }}
                    className={cn(
                      'relative w-full overflow-hidden rounded-2xl border p-4 text-left transition-colors sm:p-5',
                      isActive
                        ? 'border-primary/40 bg-card shadow-lg shadow-primary/5'
                        : 'border-transparent hover:bg-muted/60'
                    )}
                  >
                    <div className="flex items-start gap-4">
                      <span
                        className={cn(
                          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors',
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        <step.icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Schritt {index + 1} · {step.who}
                        </p>
                        <h3 className="text-lg font-bold leading-snug">{step.title}</h3>
                        <p
                          className={cn(
                            'text-sm leading-relaxed text-muted-foreground',
                            !isActive && 'hidden sm:block lg:hidden'
                          )}
                        >
                          {step.description}
                        </p>
                      </div>
                    </div>
                    {isActive && autoplay && (
                      <span
                        key={`progress-${active}`}
                        className="landing-progress absolute inset-x-0 bottom-0 h-1 bg-primary/70"
                        style={{ ['--landing-step-duration' as string]: `${STEP_DURATION_MS}ms` }}
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
