/** Public documentation (separate project: github.com/BazarPro/docs). */
export const DOCS_URL = 'https://docs.bazarpro.de';

/** Source code of BazarPro (MIT). */
export const GITHUB_URL = 'https://github.com/BazarPro/bazarpro';

/** A page of the documentation in the app language; English pages live under /en/. */
export function docsUrl(language: string | undefined, path = '/'): string {
  return `${DOCS_URL}${language?.startsWith('en') ? '/en' : ''}${path}`;
}

/** Self-hosting guide in the documentation. */
export function selfHostUrl(language: string | undefined): string {
  return docsUrl(language, '/selbst-hosten/');
}

/** The demo instance with sample bazaars, reset every night. */
export const DEMO_URL = 'https://demo.bazarpro.de';
