/**
 * Minimal Convex HTTP query client (POST /api/query) with a timeout and a small
 * TTL cache, so link-preview bursts don't hit the backend for every request.
 */

export class ConvexUnavailableError extends Error {}

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

export interface ConvexQueryClient {
  query<T>(path: string, args: Record<string, unknown>): Promise<T | null>;
}

export function createConvexClient(
  convexUrl: string,
  { timeoutMs = 2000, ttlMs = 60_000, maxEntries = 500 } = {}
): ConvexQueryClient {
  const baseUrl = convexUrl.replace(/\/+$/, '');
  const cache = new Map<string, CacheEntry>();

  return {
    /**
     * Returns the query result, or null when Convex rejects the call (e.g. an
     * invalid id). Throws ConvexUnavailableError on network errors/timeouts.
     */
    async query<T>(path: string, args: Record<string, unknown>): Promise<T | null> {
      const key = `${path}:${JSON.stringify(args)}`;
      const cached = cache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value as T | null;
      }

      let body: { status?: string; value?: unknown };
      try {
        const response = await fetch(`${baseUrl}/api/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, args, format: 'json' }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (response.status >= 500) {
          throw new Error(`HTTP ${response.status}`);
        }
        body = (await response.json()) as { status?: string; value?: unknown };
      } catch (err) {
        throw new ConvexUnavailableError(`Convex query ${path} failed: ${String(err)}`);
      }

      const value = body.status === 'success' ? (body.value ?? null) : null;

      if (cache.size >= maxEntries) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey !== undefined) cache.delete(oldestKey);
      }
      cache.set(key, { expiresAt: Date.now() + ttlMs, value });
      return value as T | null;
    },
  };
}
