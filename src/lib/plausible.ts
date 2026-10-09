import { init } from '@plausible-analytics/tracker';
import { runtimeConfig } from './runtimeConfig';

const rawDomain = runtimeConfig.plausibleDomain;
const apiHost = runtimeConfig.plausibleApiHost;

const normalizeDomain = (value?: string) => {
  if (!value) return '';
  try {
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return new URL(value).hostname;
    }
  } catch {
    // Fall back to raw input.
  }
  return value.replace(/\/+$/, '');
};

const domain = normalizeDomain(rawDomain);

const shouldEnablePlausible = () => {
  if (!domain || !apiHost) return false;
  if (typeof window === 'undefined') return false;

  const host = window.location.hostname;
  const allowedHosts = new Set([domain, `www.${domain}`]);
  return allowedHosts.has(host);
};

export const initPlausible = () => {
  if (!shouldEnablePlausible()) return;

  init({
    domain,
    endpoint: `${(apiHost ?? '').replace(/\/+$/, '')}/api/event`,
    // Pageviews are captured automatically, including client-side navigation
    autoCapturePageviews: true,
  });
};
