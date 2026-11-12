import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '../shared/constants';
import { isGermanContentPath, localeOfPath, splitLocalePrefix } from '../shared/localizedRoutes';
import { resources } from './resources';

/** Where the chosen language is remembered for visitors without account */
export const LANGUAGE_STORAGE_KEY = 'bazarpro.language';
/** Set by HomePage while signed in: `/` is then the overview, not the landing page */
const SIGNED_IN_KEY = 'bazarpro.signedIn';

function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

function readStorage(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** The language the visitor chose (language switcher or account), if any. */
export function storedLocale(): Locale | null {
  const value = readStorage(LANGUAGE_STORAGE_KEY);
  return isLocale(value) ? value : null;
}

/** Remembers an explicit choice of language. */
export function storeLocale(locale: Locale) {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, locale);
  } catch {
    // Private mode: the choice lasts until the page is closed
  }
}

/** The first supported language of the browser, if any. */
export function browserLocale(): Locale | null {
  if (typeof navigator === 'undefined') return null;
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const language of languages) {
    const code = language?.split('-')[0].toLowerCase();
    if (isLocale(code)) return code;
  }
  return null;
}

export function rememberedSignIn(): boolean {
  return readStorage(SIGNED_IN_KEY) === '1';
}

/**
 * The language a page dictates. Pages with an address per language (`/features`,
 * `/en/features`) follow the address, so search engines, which render with an English
 * browser, index German under the German address. `/` is the landing page only for
 * visitors; signed in it is the overview in the user's language. Event and product
 * pages show German content and default to German. Null: the visitor's language.
 */
export function pageLocale(pathname: string, signedIn: boolean): Locale | null {
  const fromPath = localeOfPath(pathname);
  if (fromPath) {
    const isStart = splitLocalePrefix(pathname).path === '/';
    // Signed in, `/` follows the user's language; `/en` stays English
    if (isStart && signedIn && fromPath === DEFAULT_LOCALE) return null;
    return fromPath;
  }
  if (isGermanContentPath(pathname)) return storedLocale() ?? DEFAULT_LOCALE;
  return null;
}

/** The language to show on a page. */
export function detectLocale(pathname: string, signedIn: boolean): Locale {
  return pageLocale(pathname, signedIn) ?? storedLocale() ?? browserLocale() ?? DEFAULT_LOCALE;
}

void i18n.use(initReactI18next).init({
  resources,
  lng: detectLocale(
    typeof window === 'undefined' ? '/' : window.location.pathname,
    rememberedSignIn()
  ),
  supportedLngs: [...LOCALES],
  // "en-US" means English
  nonExplicitSupportedLngs: true,
  load: 'languageOnly',
  fallbackLng: DEFAULT_LOCALE,
  defaultNS: 'common',
  interpolation: { escapeValue: false },
});

function applyDocumentLanguage(language: string) {
  if (typeof document !== 'undefined') document.documentElement.lang = language;
}
applyDocumentLanguage(i18n.resolvedLanguage ?? DEFAULT_LOCALE);
i18n.on('languageChanged', applyDocumentLanguage);

/** The current language as one of LOCALES. */
export function currentLocale(): Locale {
  const language = i18n.resolvedLanguage ?? i18n.language;
  return isLocale(language) ? language : DEFAULT_LOCALE;
}

export default i18n;
