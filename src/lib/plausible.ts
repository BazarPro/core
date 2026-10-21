import { init } from '@plausible-analytics/tracker';
import { api } from './api/functions';
import { resolvePlausible, type StoredPlausibleSettings } from './analyticsConfig';
import type { ApiClient } from './api/client';

/** Only the configured site is tracked, never previews or other domains. */
const isTrackedHost = (domain: string) => {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === domain || host === `www.${domain}`;
};

/**
 * Starts Plausible once the admin settings are known (they can switch analytics on or
 * off without a restart). If the backend cannot be reached, the server values apply.
 */
export const initPlausible = async (client: ApiClient) => {
  let stored: StoredPlausibleSettings | undefined;
  try {
    stored = (await client.query(api.instance.getConfig, {})).plausible;
  } catch {
    // keep the server values
  }
  const target = resolvePlausible(stored);
  if (!target || !isTrackedHost(target.domain)) return;

  init({
    domain: target.domain,
    endpoint: `${target.apiHost}/api/event`,
    // Pageviews are captured automatically, including client-side navigation
    autoCapturePageviews: true,
  });
};
