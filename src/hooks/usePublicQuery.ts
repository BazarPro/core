import { ConvexHttpClient } from 'convex/browser';
import { useConvex, useQuery } from 'convex/react';
import { getFunctionName, type FunctionReference, type FunctionReturnType } from 'convex/server';
import { useEffect, useState } from 'react';
import { runtimeConfig } from '../lib/runtimeConfig';

/** Wait this long for the live connection before falling back to HTTP */
const FALLBACK_AFTER_MS = 2500;

let httpClient: ConvexHttpClient | null = null;
/** Set once the live connection failed; later queries fall back right away */
let liveUnavailable = false;
function getHttpClient() {
  httpClient ??= new ConvexHttpClient(runtimeConfig.convexUrl as string);
  return httpClient;
}

/**
 * useQuery for public data that also works without a WebSocket. Search engine
 * renderers (e.g. Googlebot) do not open WebSockets, so live queries never
 * resolve and pages stay at "Laden...". If the live connection is not up in
 * time, the result is fetched once over HTTP (anonymously). As soon as the
 * live query delivers, its value wins.
 */
export function usePublicQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  args: Query['_args'] | 'skip'
): FunctionReturnType<Query> | undefined {
  const live = useQuery(query, args);
  const waiting = live === undefined;
  const convex = useConvex();
  const key = args === 'skip' ? null : `${getFunctionName(query)}:${JSON.stringify(args)}`;
  const [fallback, setFallback] = useState<{ key: string; value: FunctionReturnType<Query> }>();

  useEffect(() => {
    if (key === null || !waiting || args === 'skip') return;
    let cancelled = false;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const state = convex.connectionState();
      if (state.isWebSocketConnected) return;
      const failed = liveUnavailable || (!state.hasEverConnected && state.connectionRetries > 0);
      if (!failed && Date.now() - started < FALLBACK_AFTER_MS) return;
      window.clearInterval(timer);
      liveUnavailable = !state.hasEverConnected;
      getHttpClient()
        .query(query, args)
        .then((value) => {
          if (!cancelled) setFallback({ key, value });
        })
        .catch(() => {
          // the live query may still deliver
        });
    }, 100);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // args are captured via key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, waiting, convex, query]);

  if (live !== undefined) return live;
  return fallback && fallback.key === key ? fallback.value : undefined;
}
