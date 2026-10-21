/**
 * Configuration the Node server injects into every page (server/runtime.ts).
 * Falls back to the values baked in at build time, e.g. in `vite dev`.
 */
interface RuntimeConfig {
  /** `platform` (bazarpro.de) or `single` (self-hosted association) */
  mode?: string;
  siteUrl?: string;
  plausibleDomain?: string;
  plausibleApiHost?: string;
}

declare global {
  interface Window {
    __BAZARPRO_CONFIG__?: RuntimeConfig;
  }
}

/** Read on every access: the mobile app sets it only after its server is chosen. */
const injected = (): RuntimeConfig =>
  (typeof window !== 'undefined' && window.__BAZARPRO_CONFIG__) || {};

export const runtimeConfig = {
  get mode() {
    return (injected().mode ?? import.meta.env.VITE_BAZARPRO_MODE) === 'single'
      ? ('single' as const)
      : ('platform' as const);
  },
  get siteUrl() {
    return injected().siteUrl || (import.meta.env.VITE_SITE_URL as string | undefined);
  },
  get plausibleDomain() {
    return injected().plausibleDomain || (import.meta.env.DOMAIN_NAME as string | undefined);
  },
  get plausibleApiHost() {
    return (
      injected().plausibleApiHost || (import.meta.env.VITE_PLAUSIBLE_API_HOST as string | undefined)
    );
  },
};
