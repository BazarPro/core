import i18n from '.';

/** Locale for dates, times and numbers in the current language. */
export function dateLocale(): string {
  return i18n.resolvedLanguage === 'en' ? 'en-GB' : 'de-DE';
}
