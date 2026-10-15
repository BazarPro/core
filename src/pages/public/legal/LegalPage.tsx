import { Link } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import type { SitePageSlug } from '../../../../convex/constants';
import { Footer } from '../../../components/layout/Footer';
import { SafeMarkdown } from '../../../components/markdown/SafeMarkdown';
import { Seo } from '../../../components/seo/Seo';
import { usePublicQuery } from '../../../hooks/usePublicQuery';
import { useInstanceConfig } from '../../../hooks/useInstanceConfig';
import { applyLegalDirectives } from '../../../lib/legalDirectives';
import { LEGAL_PAGES } from '../../../lib/legalPages';
import { runtimeConfig } from '../../../lib/runtimeConfig';
import { useTranslation } from 'react-i18next';

export const LEGAL_MARKDOWN_CLASSES =
  'leading-7 [&_p]:mb-4 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-1 [&_h2]:mt-8 [&_h2]:mb-4 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:mb-3 [&_h3]:font-semibold [&_strong]:font-semibold';

/**
 * Impressum, Datenschutz and AGB. Admins maintain the texts in the dashboard; until
 * then bazarpro.de shows its own texts and a self-hosted instance shows a notice.
 */
export function LegalPage({ slug }: { slug: SitePageSlug }) {
  const info = LEGAL_PAGES[slug];
  const page = usePublicQuery(api.sitePages.get, { slug });
  const viewer = useQuery(api.users.viewer);
  const isSingle = runtimeConfig.mode === 'single';
  const { plausible } = useInstanceConfig();
  const { t } = useTranslation();

  // bazarpro.de shows its texts right away; a saved version replaces them once loaded
  const stored = page?.markdown ?? (isSingle ? undefined : info.bazarpro);
  const markdown = stored === undefined ? undefined : applyLegalDirectives(stored, plausible);
  const title = page?.title ?? info.title;

  return (
    <div className="min-h-screen flex flex-col">
      <Seo title={title} description={info.description} canonical={info.path} />
      <main className="flex-grow">
        <section className="py-20">
          <div className="container mx-auto px-4 max-w-4xl">
            <h1 className="text-3xl font-bold mb-8">{title}</h1>
            {markdown !== undefined ? (
              <SafeMarkdown content={markdown} className={LEGAL_MARKDOWN_CLASSES} />
            ) : page === null ? (
              <div className="rounded-lg border bg-muted/40 p-6 text-muted-foreground">
                <p>{t('legal.notSetUp')}</p>
                {viewer?.systemRole === 'admin' && (
                  <p className="mt-2">
                    <Link to={`/admin/pages?page=${slug}`} className="text-primary underline">
                      {t('legal.setUpNow')}
                    </Link>
                  </p>
                )}
              </div>
            ) : (
              <div className="flex justify-center py-10">
                <span className="loading loading-spinner loading-lg"></span>
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
