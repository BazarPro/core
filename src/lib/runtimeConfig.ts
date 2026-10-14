/**
 * Configuration the Node server injects into every page (server/runtime.ts).
 * Falls back to the values baked in at build time, e.g. in `vite dev`.
 */
interface RuntimeConfig {
  /** `platform` (bazarpro.de) or `single` (self-hosted association) */
  mode?: string;
  convexUrl?: string;
  siteUrl?: string;
  plausibleDomain?: string;
  plausibleApiHost?: string;
}

declare global {
  interface Window {
    __BAZARPRO_CONFIG__?: RuntimeConfig;
  }
}

const injected: RuntimeConfig = (typeof window !== 'undefined' && window.__BAZARPRO_CONFIG__) || {};

export const runtimeConfig = {
  mode:
    (injected.mode ?? import.meta.env.VITE_BAZARPRO_MODE) === 'single'
      ? ('single' as const)
      : ('platform' as const),
  convexUrl: injected.convexUrl || (import.meta.env.VITE_CONVEX_URL as string | undefined),
  siteUrl: injected.siteUrl || (import.meta.env.VITE_SITE_URL as string | undefined),
  plausibleDomain: injected.plausibleDomain || (import.meta.env.DOMAIN_NAME as string | undefined),
  plausibleApiHost:
    injected.plausibleApiHost || (import.meta.env.VITE_PLAUSIBLE_API_HOST as string | undefined),
};
