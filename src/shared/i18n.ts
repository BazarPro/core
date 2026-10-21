import { createInstance } from 'i18next';
import deMail from '../src/locales/de/mail.json';
import enMail from '../src/locales/en/mail.json';
import { DEFAULT_LOCALE, LOCALES, type Locale } from './constants';

/**
 * Texts the backend writes itself, mainly emails. They live next to the app texts in
 * src/locales/<language>/mail.json, so Weblate and the locale test cover them too.
 */
const i18n = createInstance();
void i18n.init({
  resources: { de: { mail: deMail }, en: { mail: enMail } },
  supportedLngs: [...LOCALES],
  fallbackLng: DEFAULT_LOCALE,
  defaultNS: 'mail',
  ns: ['mail'],
  interpolation: { escapeValue: false },
  // Resources are bundled, so the instance is ready right away
  initAsync: false,
});

/**
 * Translates mail texts into one language: `t('sale.subject', { title })`. A plain
 * function type, so pure helpers shared with the app (mail preview) can take one too.
 */
export type MailT = ((key: string, values?: Record<string, unknown>) => string) & {
  locale: Locale;
};

export function mailT(locale: Locale = DEFAULT_LOCALE): MailT {
  // The app declares its own namespaces for i18next; 'mail' is only known here
  const fixed = i18n.getFixedT(locale, 'mail' as never);
  const t = (key: string, values?: Record<string, unknown>) =>
    fixed(key as never, values as never) as unknown as string;
  return Object.assign(t, { locale });
}

/** The language a user reads emails in; accounts without a choice get German. */
export function localeOf(user: { locale?: Locale } | null | undefined): Locale {
  return user?.locale ?? DEFAULT_LOCALE;
}
