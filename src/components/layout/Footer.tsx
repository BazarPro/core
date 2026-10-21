import { Link } from 'react-router-dom';
import { useInstanceConfig } from '../../hooks/useInstanceConfig';
import { DOCS_URL, docsUrl } from '../../lib/links';
import { BrandLogo } from './BrandLogo';
import { useTranslation } from 'react-i18next';
import { LanguageSelect } from './LanguageSwitcher';

export function Footer() {
  const { t, i18n } = useTranslation();
  const currentYear = new Date().getFullYear();
  const { isSingle, brand, contactEmail } = useInstanceConfig();
  // A self-hosted instance does not serve the BazarPro marketing pages
  const showMarketingLinks = !isSingle;

  return (
    <footer className="py-12 border-t">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-8">
          <div>
            <Link
              to="/"
              className="flex items-center gap-2 mb-4 hover:opacity-80 transition-opacity"
            >
              <BrandLogo />
            </Link>
            <p className="text-sm text-muted-foreground">
              {isSingle
                ? contactEmail && (
                    <a href={`mailto:${contactEmail}`} className="hover:text-primary">
                      {contactEmail}
                    </a>
                  )
                : t('footer.tagline')}
            </p>
          </div>
          <div>
            <h4 className="mb-4">{t('footer.product')}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {showMarketingLinks && (
                <>
                  <li>
                    <Link to="/features" className="hover:text-primary">
                      {t('footer.features')}
                    </Link>
                  </li>
                  <li>
                    <Link to="/pricing" className="hover:text-primary">
                      {t('footer.pricing')}
                    </Link>
                  </li>
                </>
              )}
              <li>
                <a
                  href={docsUrl(i18n.resolvedLanguage)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary"
                >
                  {t('footer.docs')}
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="mb-4">{isSingle ? t('footer.contact') : t('footer.company')}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {showMarketingLinks && (
                <li>
                  <Link to="/about" className="hover:text-primary">
                    {t('footer.about')}
                  </Link>
                </li>
              )}
              <li>
                <Link to="/contact" className="hover:text-primary">
                  {t('footer.contact')}
                </Link>
              </li>
              {!isSingle && (
                <li>
                  <a
                    href="https://github.com/BazarPro/core"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary"
                  >
                    GitHub
                  </a>
                </li>
              )}
            </ul>
          </div>
          <div>
            <h4 className="mb-4">{t('footer.legal')}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link to="/privacy" className="hover:text-primary">
                  {t('footer.privacy')}
                </Link>
              </li>
              <li>
                <Link to="/terms" className="hover:text-primary">
                  {t('footer.terms')}
                </Link>
              </li>
              <li>
                <Link to="/imprint" className="hover:text-primary">
                  {t('footer.imprint')}
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
          <LanguageSelect className="mb-4" />
          {isSingle ? (
            <p>
              © {currentYear} {brand} · {t('footer.poweredBy')}{' '}
              <a
                href={DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-primary"
              >
                BazarPro
              </a>
            </p>
          ) : (
            <p>{t('footer.rights', { year: currentYear })}</p>
          )}
          {import.meta.env.VITE_APP_VERSION && (
            <p className="mt-1 text-xs opacity-50">
              {t('footer.version', { version: import.meta.env.VITE_APP_VERSION })}
            </p>
          )}
        </div>
      </div>
    </footer>
  );
}
