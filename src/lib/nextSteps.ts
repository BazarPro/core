import type { NextStep } from '../components/ui/next-steps';

/**
 * At most one step is due now: the first one marked. Two rules may hold at once, e.g. no
 * promotion yet while sellers are already there; the roadmap would show two yellow stops.
 */
export function keepFirstCurrent(steps: NextStep[]): NextStep | undefined {
  const current = steps.find((step) => step.current);
  for (const step of steps) step.current = step === current;
  return current;
}
