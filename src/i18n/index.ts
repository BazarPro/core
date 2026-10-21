import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '../shared/constants';
import { resources } from './resources';

/** Where the chosen language is remembered for visitors without account */
export const LANGUAGE_STORAGE_KEY = 'bazarpro.language';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: [...LOCALES],
    // "en-US" in the browser means English
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    fallbackLng: DEFAULT_LOCALE,
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
  });

function applyDocumentLanguage(language: string) {
  if (typeof document !== 'undefined') document.documentElement.lang = language;
}
applyDocumentLanguage(i18n.resolvedLanguage ?? DEFAULT_LOCALE);
i18n.on('languageChanged', applyDocumentLanguage);

/** The current language as one of LOCALES. */
export function currentLocale(): Locale {
  const language = i18n.resolvedLanguage ?? i18n.language;
  return (LOCALES as readonly string[]).includes(language) ? (language as Locale) : DEFAULT_LOCALE;
}

export default i18n;
