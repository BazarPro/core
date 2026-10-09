import { Calendar, ChevronLeft, ChevronRight, ShoppingBag, type LucideIcon } from 'lucide-react';
import { Fragment, useEffect, useRef, useState, type ComponentType } from 'react';
import { Button } from '../../../../components/ui/button';
import { cn } from '../../../../lib/utils';
import { useInView, usePrefersReducedMotion } from '../hooks/useLandingMotion';
import {
  CheckInScene,
  PhotoScene,
  PickupScene,
  SellScene,
  SettlementScene,
  TagScene,
} from './demo/ProcessVisuals';

const STEP_DURATION_MS = 5000;
const SWIPE_THRESHOLD_PX = 40;

type Role = 'seller' | 'organizer';

interface ProcessGroup {
  role: Role;
  label: string;
}

interface ProcessStep {
  group: ProcessGroup;
  title: string;
  description: string;
  Scene: ComponentType;
}

const SELLER_HOME: ProcessGroup = { role: 'seller', label: 'Verkäufer · zu Hause' };
const ORGANIZER_EVENT: ProcessGroup = { role: 'organizer', label: 'Veranstalter · beim Basar' };
const SELLER_AFTER: ProcessGroup = { role: 'seller', label: 'Verkäufer · nach dem Basar' };

const ROLE_STYLES: Record<
  Role,
  { icon: LucideIcon; badge: string; active: string; ring: string; text: string; bar: string }
> = {
  seller: {
    icon: ShoppingBag,
    badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    active: 'bg-amber-500 text-white',
    ring: 'border-amber-500/50',
    text: 'text-amber-700 dark:text-amber-300',
    bar: 'bg-amber-500/80',
  },
  organizer: {
    icon: Calendar,
    badge: 'bg-primary/15 text-primary',
    active: 'bg-primary text-primary-foreground',
    ring: 'border-primary/50',
    text: 'text-primary',
    bar: 'bg-primary/70',
  },
};

const steps: ProcessStep[] = [
  {
    group: SELLER_HOME,
    title: 'Fotografieren & inserieren',
    description:
      'Das alte Fahrrad aus dem Keller fotografieren, Preis festlegen und für den Basar anmelden.',
    Scene: PhotoScene,
  },
  {
    group: SELLER_HOME,
    title: 'QR-Etikett dranhängen',
    description:
      'BazarPro erstellt die Etiketten als PDF. Ausdrucken, am Artikel befestigen und zum Basar bringen.',
    Scene: TagScene,
  },
  {
    group: ORGANIZER_EVENT,
    title: 'Warenannahme',
    description:
      'Bei der Abgabe wird das Etikett gescannt – ab jetzt ist der Artikel erhältlich und hat seinen Platz.',
    Scene: CheckInScene,
  },
  {
    group: ORGANIZER_EVENT,
    title: 'Scannen & verkaufen',
    description:
      'Besucher scannen den QR-Code für Preis und Standort. An der Kasse genügt ein Scan mit dem eigenen Handy.',
    Scene: SellScene,
  },
  {
    group: ORGANIZER_EVENT,
    title: 'Kassenabschluss',
    description:
      'Umsatz, Provision und Auszahlung stehen für jeden Verkäufer fest – ohne Listen und Nachzählen.',
    Scene: SettlementScene,
  },
  {
    group: SELLER_AFTER,
    title: 'Geld & Ware abholen',
    description:
      'Verkäufer sehen ihre Abrechnung im Handy und holen Geld und unverkaufte Artikel mit ihrem digitalen Ausweis ab.',
    Scene: PickupScene,
  },
];

function StepNumber({ index, role, active }: { index: number; role: Role; active: boolean }) {
  return (
    <span
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold transition-colors',
        active ? ROLE_STYLES[role].active : ROLE_STYLES[role].badge
      )}
    >
      {index + 1}
    </span>
  );
}

function ProgressBar({ role }: { role: Role }) {
  return (
    <span
      className={cn('landing-progress absolute inset-x-0 bottom-0 h-1', ROLE_STYLES[role].bar)}
      style={{ ['--landing-step-duration' as string]: `${STEP_DURATION_MS}ms` }}
    />
  );
}

export function LandingProcess() {
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [manual, setManual] = useState(false);
  const touchStartX = useRef<number | null>(null);
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

  const goTo = (index: number) => {
    setActive((index + steps.length) % steps.length);
    setManual(true);
  };

  const activeStep = steps[active];
  const { Scene } = activeStep;
  const activeRole = ROLE_STYLES[activeStep.group.role];

  return (
    <section id="process-section" className="scroll-mt-20 py-20 sm:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-10 max-w-2xl space-y-4 text-center sm:mb-16">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            So funktioniert der Verkauf
          </p>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            Vom Keller bis zur Auszahlung
          </h2>
          <p className="text-pretty text-lg text-muted-foreground">
            Am Beispiel eines alten Fahrrads: Ein QR-Code begleitet den Artikel vom Inserat bis zur
            Abrechnung.
          </p>
        </div>

        <div
          ref={ref}
          className="mx-auto grid max-w-6xl items-center gap-4 lg:grid-cols-2 lg:gap-16"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
        >
          <div
            aria-hidden="true"
            className="relative order-first flex min-h-[22rem] touch-pan-y items-center justify-center rounded-[2rem] bg-gradient-to-br from-primary/10 via-muted/40 to-transparent p-4 pt-14 sm:min-h-[28rem] sm:p-8 sm:pt-16 lg:order-last"
            onTouchStart={(e) => {
              touchStartX.current = e.touches[0].clientX;
            }}
            onTouchEnd={(e) => {
              if (touchStartX.current === null) return;
              const dx = e.changedTouches[0].clientX - touchStartX.current;
              touchStartX.current = null;
              if (Math.abs(dx) > SWIPE_THRESHOLD_PX) goTo(active + (dx < 0 ? 1 : -1));
            }}
          >
            <span
              className={cn(
                'absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold sm:left-6 sm:top-6',
                activeRole.badge
              )}
            >
              <activeRole.icon className="h-3.5 w-3.5" />
              {activeStep.group.label}
            </span>
            {/* key remounts the scene so its animations replay */}
            <div key={active} className="landing-fade-up flex w-full justify-center">
              <Scene />
            </div>
          </div>

          {/* Mobile: the active step right below the scene, with prev/next and dots */}
          <div className="lg:hidden">
            <div
              aria-live="polite"
              className={cn(
                'relative min-h-[8.5rem] overflow-hidden rounded-2xl border bg-card p-4 shadow-lg',
                activeRole.ring
              )}
            >
              <div className="flex items-start gap-3">
                <StepNumber index={active} role={activeStep.group.role} active />
                <div className="min-w-0 space-y-1 pt-1">
                  <h3 className="font-bold leading-snug">{activeStep.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {activeStep.description}
                  </p>
                </div>
              </div>
              {autoplay && <ProgressBar key={`m-${active}`} role={activeStep.group.role} />}
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="icon"
                aria-label="Vorheriger Schritt"
                onClick={() => goTo(active - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-1.5">
                {steps.map((step, index) => (
                  <button
                    key={step.title}
                    type="button"
                    aria-label={`Schritt ${index + 1}: ${step.title}`}
                    aria-current={index === active ? 'step' : undefined}
                    onClick={() => goTo(index)}
                    className={cn(
                      'h-2.5 rounded-full transition-all',
                      index === active
                        ? cn('w-6', ROLE_STYLES[step.group.role].active)
                        : cn('w-2.5', ROLE_STYLES[step.group.role].badge)
                    )}
                  />
                ))}
              </div>
              <Button
                variant="outline"
                size="icon"
                aria-label="Nächster Schritt"
                onClick={() => goTo(active + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Desktop: all steps, grouped by role */}
          <ol className="hidden space-y-1 lg:block">
            {steps.map((step, index) => {
              const isActive = index === active;
              const role = ROLE_STYLES[step.group.role];
              const startsGroup = index === 0 || steps[index - 1].group !== step.group;
              return (
                <Fragment key={step.title}>
                  {startsGroup && (
                    <li
                      aria-hidden="true"
                      className={cn(
                        'flex items-center gap-2 px-4 pb-1 text-sm font-semibold',
                        index > 0 && 'pt-4',
                        role.text
                      )}
                    >
                      <role.icon className="h-4 w-4" />
                      {step.group.label}
                    </li>
                  )}
                  <li>
                    <button
                      type="button"
                      aria-current={isActive ? 'step' : undefined}
                      aria-label={`${step.group.label}: ${step.title}`}
                      onClick={() => goTo(index)}
                      className={cn(
                        'relative w-full overflow-hidden rounded-2xl border p-4 text-left transition-colors',
                        isActive
                          ? cn('bg-card shadow-lg', role.ring)
                          : 'border-transparent hover:bg-muted/60'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <StepNumber index={index} role={step.group.role} active={isActive} />
                        <div className="min-w-0 space-y-1 pt-1">
                          <h3 className="font-bold leading-snug">{step.title}</h3>
                          {isActive && (
                            <p className="text-sm leading-relaxed text-muted-foreground">
                              {step.description}
                            </p>
                          )}
                        </div>
                      </div>
                      {isActive && autoplay && (
                        <ProgressBar key={`d-${active}`} role={step.group.role} />
                      )}
                    </button>
                  </li>
                </Fragment>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
