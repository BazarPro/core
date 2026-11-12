import { X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import i18n, { browserLocale, storedLocale, storeLocale } from '../../i18n';
import { languageVersions } from '../../i18n/languageVersions';
import { LOCALE_NAMES } from '../../shared/constants';
import { localeOfPath } from '../../shared/localizedRoutes';

const HINT_DISMISSED_KEY = 'bazarpro.languageHintDismissed';

/**
 * Plain links to this page in the other languages. Unlike the language select, search
 * engines follow them, so the versions are linked from each other.
 */
export function LanguageVersionLinks({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const own = localeOfPath(pathname);
  const others = languageVersions(pathname).filter((version) => version.locale !== own);
  if (!own || others.length === 0) return null;
  return (
    <p className={`text-sm text-muted-foreground ${className}`}>
      {t('language.versions')}{' '}
      {others.map((version, index) => (
        <span key={version.locale}>
          {index > 0 && ' · '}
          <Link
            to={version.path}
            hrefLang={version.locale}
            lang={version.locale}
            className="underline underline-offset-4 hover:text-primary"
          >
            {LOCALE_NAMES[version.locale]}
          </Link>
        </span>
      ))}
    </p>
  );
}

function hintDismissed(): boolean {
  try {
    return sessionStorage.getItem(HINT_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * The hint is for people only: crawlers render with an English browser, and the
 * prerendering (scripts/prerender-public.js, an automated browser) would bake it into
 * the static HTML.
 */
function isAutomated(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    (navigator.webdriver || /bot|crawl|spider|slurp/i.test(navigator.userAgent))
  );
}

/**
 * The address decides the language of the landing and marketing pages. A visitor whose
 * browser prefers another language, and who has not chosen one, gets a hint to that
 * version instead of a redirect, which would hide the page from search engines.
 */
export function LanguageHint() {
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(hintDismissed);
  const own = localeOfPath(pathname);
  const preferred = browserLocale();
  const target = languageVersions(pathname).find(
    (version) => version.locale === preferred && version.locale !== own
  );
  if (!own || !target || dismissed || storedLocale() || isAutomated()) return null;

  // In the language the visitor reads
  const t = i18n.getFixedT(target.locale);
  const dismiss = () => {
    try {
      sessionStorage.setItem(HINT_DISMISSED_KEY, '1');
    } catch {
      // Private mode: hidden until the next page load
    }
    setDismissed(true);
  };

  return (
    <div
      role="note"
      lang={target.locale}
      data-nosnippet=""
      className="flex items-center gap-3 border-b bg-muted/50 px-4 py-2 text-sm"
    >
      <span className="min-w-0 flex-1">
        {t('language.hint')}{' '}
        <Link
          to={target.path}
          hrefLang={target.locale}
          onClick={() => storeLocale(target.locale)}
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          {t('language.hintOpen')}
        </Link>
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('language.hintDismiss')}
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
