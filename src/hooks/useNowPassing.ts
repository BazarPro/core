import { useEffect, useState } from 'react';

/** setTimeout fires at once beyond this (about 24.8 days); later times wait in steps. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * The current time, updated when it passes one of `times` (milliseconds), e.g. the start
 * and end of an event. A page that derives "running" or "over" from it shows the new state
 * at that moment without a reload; the data from the backend does not change then (#126).
 */
export function useNowPassing(times: readonly (number | null | undefined)[]): number {
  const [now, setNow] = useState(() => Date.now());
  const key = times.join(',');

  useEffect(() => {
    const next = key
      .split(',')
      .map(Number)
      .filter((time) => Number.isFinite(time) && time > now)
      .reduce((earliest, time) => Math.min(earliest, time), Infinity);
    if (next === Infinity) return;
    // A little after, so the comparison with the boundary has flipped
    const delay = Math.min(next - Date.now() + 50, MAX_TIMEOUT_MS);
    const timer = setTimeout(() => setNow(Date.now()), Math.max(delay, 0));
    return () => clearTimeout(timer);
  }, [key, now]);

  // A boundary changed (e.g. the event was moved): compare with the current time
  const [seenKey, setSeenKey] = useState(key);
  if (seenKey !== key) {
    setSeenKey(key);
    setNow(Date.now());
  }
  return now;
}
