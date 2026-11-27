import { Calendar, Tag, type LucideIcon } from 'lucide-react';
import { Fragment, useEffect, useRef, useState, type ComponentType } from 'react';
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
import { useTranslation } from 'react-i18next';

const STEP_DURATION_MS = 5000;
const SWIPE_THRESHOLD_PX = 40;

type Role = 'seller' | 'organizer';

type StepId = 'photo' | 'tag' | 'checkIn' | 'sell' | 'settlement' | 'pickup';

interface ProcessGroup {
  role: Role;
  id: 'sellerHome' | 'organizerEvent' | 'sellerAfter';
}

interface ProcessStep {
  group: ProcessGroup;
  id: StepId;
  Scene: ComponentType;
}

const SELLER_HOME: ProcessGroup = { role: 'seller', id: 'sellerHome' };
const ORGANIZER_EVENT: ProcessGroup = { role: 'organizer', id: 'organizerEvent' };
const SELLER_AFTER: ProcessGroup = { role: 'seller', id: 'sellerAfter' };

const ROLE_STYLES: Record<
  Role,
  { icon: LucideIcon; badge: string; active: string; ring: string; text: string; bar: string }
> = {
  // Roles in neutral and the action colour: yellow is for what is due now, green for states
  seller: {
    icon: Tag,
    badge: 'bg-muted text-foreground',
    active: 'bg-foreground text-background',
    ring: 'border-foreground/30',
    text: 'text-foreground',
    bar: 'bg-foreground/50',
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
    id: 'photo',
    Scene: PhotoScene,
  },
  {
    group: SELLER_HOME,
    id: 'tag',
    Scene: TagScene,
  },
  {
    group: ORGANIZER_EVENT,
    id: 'checkIn',
    Scene: CheckInScene,
  },
  {
    group: ORGANIZER_EVENT,
    id: 'sell',
    Scene: SellScene,
  },
  {
    group: ORGANIZER_EVENT,
    id: 'settlement',
    Scene: SettlementScene,
  },
  {
    group: SELLER_AFTER,
    id: 'pickup',
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

/** One step on phones: number on the line, title and text, then its scene once in view. */
function PhoneStep({
  index,
  role,
  title,
  description,
  Scene,
}: {
  index: number;
  role: Role;
  title: string;
  description: string;
  Scene: ComponentType;
}) {
  const { ref, inView } = useInView<HTMLLIElement>(0.25);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (inView) setSeen(true);
  }, [inView]);
  return (
    <li ref={ref} className="relative pl-12">
      <span className="absolute left-0 top-0">
        <StepNumber index={index} role={role} active />
      </span>
      <h3 className="pt-1 text-lg font-bold leading-snug">{title}</h3>
      <p className="mt-1 text-base leading-relaxed text-muted-foreground">{description}</p>
      {/* The scene plays once it scrolls in; until then it keeps its place */}
      <div
        aria-hidden="true"
        className="mt-4 flex min-h-56 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-muted/40 to-transparent p-4"
      >
        {seen && (
          <div className="landing-fade-up flex w-full justify-center">
            <Scene />
          </div>
        )}
      </div>
    </li>
  );
}

export function LandingProcess() {
  const { t } = useTranslation('landing');
  const groupLabel = (group: ProcessGroup) => t(`process.groups.${group.id}`);
  const stepTitle = (step: ProcessStep) => t(`process.steps.${step.id}.title`);
  const stepDescription = (step: ProcessStep) => t(`process.steps.${step.id}.description`);
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

  return (
    <section id="process-section" className="scroll-mt-20 py-20 sm:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-10 max-w-2xl space-y-4 text-center sm:mb-16">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            {t('process.eyebrow')}
          </p>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            {t('process.title')}
          </h2>
          <p className="text-pretty text-lg text-muted-foreground">{t('process.text')}</p>
        </div>

        <div
          ref={ref}
          // One column that never grows past the screen: wide scenes stay inside on phones
          className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-4 lg:grid-cols-2 lg:gap-16"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
        >
          <div
            aria-hidden="true"
            // The step list beside names the role; the scene alone, in the middle
            className="relative order-last hidden h-[30rem] flex-col justify-center rounded-[2rem] bg-gradient-to-br from-primary/10 via-muted/40 to-transparent p-6 lg:sticky lg:top-24 lg:flex"
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
            {/* key remounts the scene so its animations replay */}
            <div
              key={active}
              className="landing-fade-up flex min-h-0 w-full flex-1 items-center justify-center"
            >
              <Scene />
            </div>
          </div>

          {/* Phones: every step below the other on a line, each with its scene */}
          <ol className="relative space-y-8 lg:hidden">
            <span
              aria-hidden="true"
              className="absolute bottom-4 left-[1.1rem] top-4 w-0.5 -translate-x-1/2 bg-border"
            />
            {steps.map((step, index) => {
              const role = ROLE_STYLES[step.group.role];
              const startsGroup = index === 0 || steps[index - 1].group !== step.group;
              return (
                <Fragment key={step.id}>
                  {startsGroup && (
                    <li
                      aria-hidden="true"
                      className={cn(
                        'relative flex items-center gap-2 bg-background py-1 text-sm font-semibold',
                        role.text
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-9 items-center justify-center rounded-full',
                          role.badge
                        )}
                      >
                        <role.icon className="size-4" />
                      </span>
                      {groupLabel(step.group)}
                    </li>
                  )}
                  <PhoneStep
                    index={index}
                    role={step.group.role}
                    title={stepTitle(step)}
                    description={stepDescription(step)}
                    Scene={step.Scene}
                  />
                </Fragment>
              );
            })}
          </ol>

          {/* Desktop: all steps, grouped by role */}
          <ol className="hidden space-y-1 lg:block">
            {steps.map((step, index) => {
              const isActive = index === active;
              const role = ROLE_STYLES[step.group.role];
              const startsGroup = index === 0 || steps[index - 1].group !== step.group;
              return (
                <Fragment key={step.id}>
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
                      {groupLabel(step.group)}
                    </li>
                  )}
                  <li>
                    <button
                      type="button"
                      aria-current={isActive ? 'step' : undefined}
                      aria-label={`${groupLabel(step.group)}: ${stepTitle(step)}`}
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
                          <h3 className="font-bold leading-snug">{stepTitle(step)}</h3>
                          {/* Opens by its height, so the steps below glide instead of jumping */}
                          <div
                            className={cn(
                              'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
                              isActive ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                            )}
                          >
                            <p className="min-h-0 overflow-hidden text-sm leading-relaxed text-muted-foreground">
                              {stepDescription(step)}
                            </p>
                          </div>
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
