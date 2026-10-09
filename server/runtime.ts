/**
 * Runtime configuration for the browser. The same image can run under any
 * domain: the server tells the client which Convex backend to use and
 * replaces the site URL the pages were prerendered with.
 */

export interface ClientConfig {
  convexUrl?: string;
  siteUrl?: string;
  plausibleDomain?: string;
  plausibleApiHost?: string;
}

export interface RuntimeOptions {
  clientConfig: ClientConfig;
  /** Site URL baked into the build (prerendered pages, robots.txt, sitemap.xml) */
  buildSiteUrl?: string;
  siteUrl: string;
}

export const CONFIG_GLOBAL = '__BAZARPRO_CONFIG__';

const CONFIG_SCRIPT = /<script id="bazarpro-config">[\s\S]*?<\/script>/;

export function configScript(config: ClientConfig): string {
  const defined = Object.fromEntries(Object.entries(config).filter(([, value]) => value));
  // '<' is escaped so a value cannot close the script tag
  const json = JSON.stringify(defined).replace(/</g, '\\u003c');
  return `<script id="bazarpro-config">window.${CONFIG_GLOBAL}=${json}</script>`;
}

/** Replaces the build-time site URL; also used for robots.txt and sitemap.xml. */
export function rewriteSiteUrl(text: string, options: RuntimeOptions): string {
  const { buildSiteUrl, siteUrl } = options;
  if (!buildSiteUrl || buildSiteUrl === siteUrl) return text;
  return text.split(buildSiteUrl).join(siteUrl);
}

/** Adds the config script as the first element of <head> (runs before the app bundle). */
export function injectRuntime(html: string, options: RuntimeOptions): string {
  const script = configScript(options.clientConfig);
  const rewritten = rewriteSiteUrl(html, options);
  if (CONFIG_SCRIPT.test(rewritten)) return rewritten.replace(CONFIG_SCRIPT, () => script);
  return rewritten.replace(/<head(\s[^>]*)?>/i, (head) => `${head}${script}`);
}
