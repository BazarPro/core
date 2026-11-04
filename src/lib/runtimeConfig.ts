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
  // Runtime only: a value baked into the published image would apply to every self-hosted
  // instance and name bazarpro.de's Plausible server as theirs
  get plausibleDomain() {
    return injected().plausibleDomain;
  },
  get plausibleApiHost() {
    return injected().plausibleApiHost;
  },
};
