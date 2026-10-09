import { afterEach, beforeEach, vi } from 'vitest';

// convex-test runs scheduled functions (ctx.scheduler) on real timers after
// the mutation returned, i.e. after the test may have finished ("Write
// outside of transaction"). Faking only setTimeout keeps them queued unless a
// test advances the timers; Date.now() stays real.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
});
