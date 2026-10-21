import { useQuery } from '../lib/api/react';
import { api } from '../lib/api/functions';
import { resolvePlausible } from '../lib/analyticsConfig';
import { runtimeConfig } from '../lib/runtimeConfig';

/**
 * Mode, name and logo of this installation. The mode comes from the server with the
 * page, so the first render already knows it; name and logo load from Convex.
 */
export function useInstanceConfig() {
  const config = useQuery(api.instance.getConfig, {});
  const mode = config?.mode ?? runtimeConfig.mode;
  return {
    mode,
    isSingle: mode === 'single',
    /** Association name on a self-hosted instance, else BazarPro */
    brand: config?.brand ?? (mode === 'single' ? 'Basar' : 'BazarPro'),
    name: config?.name,
    contactEmail: config?.contactEmail,
    logoUrl: config?.logoUrl ?? null,
    /** Stored analytics settings; `plausible` is where page views go, or null */
    plausibleSettings: config?.plausible,
    plausible: resolvePlausible(config?.plausible),
    isLoading: config === undefined,
  };
}
