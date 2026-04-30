import Plausible from 'plausible-tracker';

const rawDomain = import.meta.env.DOMAIN_NAME;
const apiHost = import.meta.env.VITE_PLAUSIBLE_API_HOST;

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

  const plausible = Plausible({
    domain,
    apiHost,
  });
  plausible.enableAutoPageviews();
};
