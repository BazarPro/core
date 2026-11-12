// Shared by the app, the web server (server/) and the build scripts.
import { DEFAULT_LOCALE, LOCALES, type Locale } from './constants.ts';

/**
 * Pages with one address per language: German without prefix (`/features`), the other
 * languages with one (`/en/features`). Search engines index each language separately
 * and link them through hreflang; the address alone decides the language, so a crawler
 * with an English browser still sees the German page under the German address.
 */
export const LOCALIZED_ROUTES = ['/', '/features', '/pricing', '/about', '/contact'];

/** Languages with a path prefix: all except the default language. */
export const PREFIXED_LOCALES = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

/**
 * Public pages without a translated address (event and product pages, legal texts).
 * Their content is German, so they show German unless the visitor chose a language.
 */
const GERMAN_CONTENT_PATHS = [
  /^\/public-events\/[^/]+(\/products)?$/i,
  /^\/products\/view\/[^/]+$/i,
  /^\/(privacy|terms|imprint)$/i,
];

function withoutTrailingSlash(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') || '/' : pathname;
}

/** Splits `/en/features` into `en` and `/features`; paths without prefix get no locale. */
export function splitLocalePrefix(pathname: string): { locale: Locale | null; path: string } {
  const path = withoutTrailingSlash(pathname);
  for (const locale of PREFIXED_LOCALES) {
    const prefix = `/${locale}`;
    if (path.toLowerCase() === prefix) return { locale, path: '/' };
    if (path.toLowerCase().startsWith(`${prefix}/`)) {
      return { locale, path: path.slice(prefix.length) };
    }
  }
  return { locale: null, path };
}

export function isLocalizedRoute(path: string): boolean {
  return LOCALIZED_ROUTES.includes(withoutTrailingSlash(path).toLowerCase());
}

/** The address of a localized page in a language; other paths stay unchanged. */
export function localizedPath(path: string, locale: Locale): string {
  const { path: base } = splitLocalePrefix(path);
  if (!isLocalizedRoute(base)) return path;
  if (locale === DEFAULT_LOCALE) return base;
  return base === '/' ? `/${locale}` : `/${locale}${base}`;
}

/** All addresses of a localized page (with the default language), for hreflang. */
export function localizedAlternates(path: string): { locale: Locale; path: string }[] {
  const { path: base } = splitLocalePrefix(path);
  if (!isLocalizedRoute(base)) return [];
  return LOCALES.map((locale) => ({ locale, path: localizedPath(base, locale) }));
}

/**
 * The language a path dictates: the prefix for localized pages, German for their
 * addresses without prefix. Null where the visitor's own choice decides (`german
 * content` pages: see contentLocaleOfPath).
 */
export function localeOfPath(pathname: string): Locale | null {
  const { locale, path } = splitLocalePrefix(pathname);
  if (!isLocalizedRoute(path)) return null;
  return locale ?? DEFAULT_LOCALE;
}

/** Whether a public page shows German content and so defaults to German. */
export function isGermanContentPath(pathname: string): boolean {
  const path = withoutTrailingSlash(pathname);
  return GERMAN_CONTENT_PATHS.some((pattern) => pattern.test(path));
}
