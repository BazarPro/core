/**
 * Minimal query client for the backend (POST /api/query/<name>) with a timeout and a
 * small TTL cache, so link-preview bursts don't hit the backend for every request.
 */

export class BackendUnavailableError extends Error {}

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

export interface BackendQueryClient {
  query<T>(path: string, args: Record<string, unknown>): Promise<T | null>;
}

export function createBackendClient(
  backendUrl: string,
  { timeoutMs = 2000, ttlMs = 60_000, maxEntries = 500 } = {}
): BackendQueryClient {
  const baseUrl = backendUrl.replace(/\/+$/, '');
  const cache = new Map<string, CacheEntry>();

  return {
    /**
     * Returns the query result, or null when the backend rejects the call (e.g. an
     * invalid id). Throws BackendUnavailableError on server or network errors and timeouts.
     */
    async query<T>(path: string, args: Record<string, unknown>): Promise<T | null> {
      const key = `${path}:${JSON.stringify(args)}`;
      const cached = cache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value as T | null;
      }

      let value: unknown;
      try {
        const response = await fetch(`${baseUrl}/api/query/${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (response.status >= 500) {
          throw new Error(`HTTP ${response.status}`);
        }
        // 4xx: the function refused, e.g. an unknown id
        value = response.ok
          ? (((await response.json()) as { value?: unknown }).value ?? null)
          : null;
      } catch (err) {
        throw new BackendUnavailableError(`Backend query ${path} failed: ${String(err)}`);
      }

      if (cache.size >= maxEntries) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey !== undefined) cache.delete(oldestKey);
      }
      cache.set(key, { expiresAt: Date.now() + ttlMs, value });
      return value as T | null;
    },
  };
}
