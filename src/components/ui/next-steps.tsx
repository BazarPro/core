import { Check, ChevronRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';

export interface NextStep {
  id: string;
  icon: LucideIcon;
  title: ReactNode;
  /** What is the state right now, e.g. "4 angemeldet" */
  text?: ReactNode;
  to?: string;
  /** Link state, e.g. a filter for the page */
  state?: unknown;
  done?: boolean;
  /** The step to do now: at most one, highlighted */
  current?: boolean;
  /**
   * Left behind, but past its use: shown neutral, not with the dashed yellow edge, e.g.
   * promotion once the bazaar runs
   */
  lapsed?: boolean;
  /** How far the step is (0–1), shown as a bar, e.g. items sold of all */
  progress?: number;
}

/** The way through a bazaar: what is done, what is next, each step leads to its page. */
export function NextSteps({ title, steps }: { title: ReactNode; steps: NextStep[] }) {
  return (
    <section className="rounded-xl border bg-card shadow-xs">
      <h2 className="px-5 pt-5 text-lg font-semibold sm:px-6">{title}</h2>
      <ol className="mt-3 divide-y border-t">
        {steps.map((step) => {
          const Icon = step.done ? Check : step.icon;
          const content = (
            <>
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground',
                  step.done && 'bg-success-soft text-success-soft-foreground',
                  step.current && 'bg-tag text-tag-foreground ring-2 ring-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block', step.current ? 'font-semibold' : 'font-medium')}>
                  {step.title}
                </span>
                {step.text && (
                  <span className="block text-sm text-muted-foreground">{step.text}</span>
                )}
              </span>
              {step.to && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
            </>
          );
          const row = 'flex items-center gap-4 px-5 py-3.5 sm:px-6';
          return (
            <li
              key={step.id}
              aria-current={step.current ? 'step' : undefined}
              className={cn(step.current && 'bg-primary/5')}
            >
              {step.to ? (
                <Link
                  to={step.to}
                  state={step.state}
                  className={cn(row, 'transition-colors last:rounded-b-xl hover:bg-muted/50')}
                >
                  {content}
                </Link>
              ) : (
                <div className={row}>{content}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
