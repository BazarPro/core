import { ArrowRight, Check, PartyPopper } from 'lucide-react';
import { useId, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { Button } from './button';
import type { NextStep } from './next-steps';

/**
 * The way through a bazaar and what to do now, in one card: the stops on top, below them
 * the step due now in tag yellow. A notch and a line lead from the stop due now down into
 * it, so the box reads as coming out of that stop (like a speech bubble).
 */
export function BazaarJourney({
  steps,
  label,
  nowLabel,
  positionLabel,
  action,
  doneText,
  context,
  children,
}: {
  steps: NextStep[];
  /** Heading above the stops, also the name of the navigation */
  label: string;
  /** "Jetzt dran" */
  nowLabel: string;
  /** "Schritt 4 von 5" */
  positionLabel: (position: number, total: number) => string;
  /** The words of the one button */
  action: ReactNode;
  /** Without a step due: all is done */
  doneText: ReactNode;
  /** Small line under the title, e.g. the bazaar it is about */
  context?: ReactNode;
  /** More inside the yellow part, e.g. steps left behind */
  children?: ReactNode;
}) {
  const currentIndex = steps.findIndex((step) => step.current);
  const current = steps[currentIndex];
  // The middle of the stop due now, as a share of the width of the stops
  const at = currentIndex >= 0 ? (currentIndex + 0.5) / steps.length : undefined;
  return (
    <section
      data-testid="bazaar-journey"
      // The stops and the notch share the side padding, so the notch meets the stop
      className="overflow-hidden rounded-xl border bg-card shadow-sm [--pad:0.75rem] sm:[--pad:1.25rem]"
    >
      <div className="px-[var(--pad)] pt-4">
        <BazaarRoadmap steps={steps} label={label} nowLabel={nowLabel} connect={at !== undefined} />
      </div>
      <NextStepCard
        step={current}
        eyebrow={
          current ? `${nowLabel} · ${positionLabel(currentIndex + 1, steps.length)}` : undefined
        }
        action={action}
        doneText={doneText}
        context={context}
        pointerAt={at}
      >
        {children}
      </NextStepCard>
    </section>
  );
}

/**
 * The stops of a bazaar: done ones with a tick, the one due now in tag yellow, ones left
 * behind with a dashed yellow edge, the rest outlined. Every stop leads to its page. On
 * phones only the stops show; the card below names the one due now.
 */
export function BazaarRoadmap({
  steps,
  label,
  nowLabel,
  connect = false,
}: {
  steps: NextStep[];
  /** Heading above the stops, also the name of the navigation */
  label: string;
  /** For screen readers at the stop due now, e.g. "Jetzt dran" */
  nowLabel: string;
  /** A line from the stop due now down to the card below */
  connect?: boolean;
}) {
  const currentIndex = steps.findIndex((step) => step.current);
  const width = 100 / steps.length;
  const headingId = useId();
  return (
    <nav aria-labelledby={headingId}>
      <h2 id={headingId} className="mb-4 px-1 text-base font-bold">
        {label}
      </h2>
      <ol
        className="relative grid"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {/* The line between the stops, through their middle: blue where both ends are done */}
        {steps.slice(1).map((step, index) => (
          <span
            key={step.id}
            aria-hidden="true"
            className={cn(
              'absolute top-[19px] h-0.5',
              steps[index].done && step.done ? 'bg-primary' : 'bg-border'
            )}
            style={{ left: `${width * (index + 0.5)}%`, width: `${width}%` }}
          />
        ))}
        {/* From the stop due now down to its card */}
        {connect && currentIndex >= 0 && (
          <span
            aria-hidden="true"
            className="absolute -bottom-3 top-9 w-0.5 -translate-x-1/2 bg-tag"
            style={{ left: `${width * (currentIndex + 0.5)}%` }}
          />
        )}
        {steps.map((step, index) => {
          const Icon = step.icon;
          const behind = currentIndex >= 0 && index < currentIndex && !step.done && !step.lapsed;
          const content = (
            <>
              <span
                className={cn(
                  'relative z-10 mx-auto flex size-8 items-center justify-center rounded-full border-2 bg-card font-display text-sm font-extrabold',
                  step.done && 'border-primary bg-primary text-primary-foreground',
                  step.current && 'border-tag bg-tag text-tag-foreground ring-4 ring-tag/30',
                  behind && 'border-dashed border-tag text-foreground',
                  !step.done && !step.current && !behind && 'border-input text-muted-foreground'
                )}
              >
                {step.done ? (
                  <Check className="size-4" strokeWidth={3} />
                ) : step.current ? (
                  <Icon className="size-4" />
                ) : (
                  index + 1
                )}
              </span>
              <span className="mt-3 block px-1 text-center sr-only sm:not-sr-only">
                <span
                  className={cn(
                    'mx-auto block max-w-[10rem] text-[13px] leading-snug',
                    step.current
                      ? // Readable above the line that runs down behind it
                        'relative z-10 w-fit bg-card px-1.5 font-bold'
                      : 'font-medium',
                    !step.done && !step.current && !behind && 'text-muted-foreground'
                  )}
                >
                  {step.title}
                </span>
                {step.current && <span className="sr-only"> ({nowLabel})</span>}
                {/* The figures stand in the card below; here only for screen readers */}
                {step.text && (
                  <>
                    <span className="sr-only">: </span>
                    <span className="sr-only">{step.text}</span>
                  </>
                )}
              </span>
            </>
          );
          return (
            <li key={step.id} aria-current={step.current ? 'step' : undefined}>
              {step.to ? (
                <Link
                  to={step.to}
                  state={step.state}
                  className="block rounded-lg py-1 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring"
                >
                  {content}
                </Link>
              ) : (
                <div className="py-1">{content}</div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * The one thing to do now, with its button, on tag yellow. `pointerAt` (0–1, the stop's
 * middle across the stops) adds the notch that points up at it. Without a step due,
 * `doneText` says all is done.
 */
export function NextStepCard({
  step,
  eyebrow,
  action,
  doneText,
  context,
  pointerAt,
  children,
}: {
  step: NextStep | undefined;
  eyebrow?: ReactNode;
  action: ReactNode;
  doneText: ReactNode;
  context?: ReactNode;
  pointerAt?: number;
  children?: ReactNode;
}) {
  const notch: CSSProperties | undefined =
    pointerAt !== undefined && step
      ? { left: `calc(var(--pad, 0px) + (100% - 2 * var(--pad, 0px)) * ${pointerAt})` }
      : undefined;
  return (
    <div
      data-testid="next-step"
      className={cn(
        '@container relative border-tag/60 bg-tag-soft',
        notch ? 'mt-3 border-t' : 'rounded-xl border'
      )}
    >
      {notch && (
        <span
          aria-hidden="true"
          className="absolute -top-[9px] size-4 -translate-x-1/2 rotate-45 border-l border-t border-tag/60 bg-tag-soft"
          style={notch}
        />
      )}
      <div className="space-y-4 p-5 sm:px-7 sm:py-6">
        {step ? (
          <div className="flex flex-col gap-4 @xl:flex-row @xl:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <span
                aria-hidden="true"
                className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-card text-tag-soft-foreground ring-1 ring-tag"
              >
                <step.icon className="size-6" />
              </span>
              <div className="min-w-0 flex-1">
                {eyebrow && (
                  <p className="text-sm font-semibold text-tag-soft-foreground">{eyebrow}</p>
                )}
                <h2 className="text-xl font-extrabold leading-tight sm:text-2xl">{step.title}</h2>
                {step.text && <p className="mt-1 text-muted-foreground">{step.text}</p>}
                {step.progress !== undefined && (
                  <div
                    aria-hidden="true"
                    className="mt-2 h-1.5 max-w-xs overflow-hidden rounded-full bg-tag/30"
                  >
                    <div
                      className="h-full rounded-full bg-tag"
                      style={{ width: `${Math.round(Math.min(1, step.progress) * 100)}%` }}
                    />
                  </div>
                )}
                {context && (
                  <p className="mt-1 truncate text-sm text-muted-foreground">{context}</p>
                )}
              </div>
            </div>
            {step.to && (
              <Button asChild size="lg" className="shrink-0 @max-xl:w-full">
                <Link to={step.to} state={step.state}>
                  {action}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <p className="flex items-center gap-3 text-lg font-semibold">
            <PartyPopper className="size-6 shrink-0 text-primary" />
            {doneText}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
