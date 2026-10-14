import { runtimeConfig } from './runtimeConfig';

export interface StoredPlausibleSettings {
  enabled?: boolean;
  domain?: string;
  apiHost?: string;
}

export interface PlausibleTarget {
  domain: string;
  apiHost: string;
}

export function normalizeDomain(value?: string): string {
  if (!value) return '';
  try {
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return new URL(value).hostname;
    }
  } catch {
    // Fall back to raw input.
  }
  return value.replace(/\/+$/, '');
}

/**
 * Where page views go, or null when analytics is off. Admin settings win; values
 * left empty fall back to PLAUSIBLE_DOMAIN / PLAUSIBLE_API_HOST of the web server.
 * Without an explicit switch, analytics is on exactly when both values are known.
 */
export function resolvePlausible(
  stored: StoredPlausibleSettings | undefined,
  env: { plausibleDomain?: string; plausibleApiHost?: string } = runtimeConfig
): PlausibleTarget | null {
  const domain = normalizeDomain(stored?.domain || env.plausibleDomain);
  const apiHost = (stored?.apiHost || env.plausibleApiHost || '').replace(/\/+$/, '');
  if (!domain || !apiHost) return null;
  if (stored?.enabled === false) return null;
  return { domain, apiHost };
}
