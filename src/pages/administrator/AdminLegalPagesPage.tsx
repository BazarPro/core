import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '../../lib/api/react';
import { toast } from 'sonner';
import { AlertTriangle, ExternalLink, FileText } from 'lucide-react';
import { api } from '../../lib/api/functions';
import { SITE_PAGE_SLUGS, type SitePageSlug } from '../../shared/constants';
import { SafeMarkdown } from '../../components/markdown/SafeMarkdown';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { useInstanceConfig } from '../../hooks/useInstanceConfig';
import { ANALYTICS_DIRECTIVE, applyLegalDirectives } from '../../lib/legalDirectives';
import { LEGAL_PAGES, hasPlaceholders } from '../../lib/legalPages';
import { formatDateTime } from '../../lib/moderation';
import { runtimeConfig } from '../../lib/runtimeConfig';
import { LEGAL_MARKDOWN_CLASSES } from '../public/legal/LegalPage';
import { AdminGuard, AdminPageHeader, FilterTabs } from './components/AdminShared';
import { Trans, useTranslation } from 'react-i18next';

export function AdminLegalPagesPage() {
  return (
    <AdminGuard>
      <LegalPagesEditor />
    </AdminGuard>
  );
}

/** Impressum, Datenschutz and AGB as Markdown; every save is kept as a version. */
function LegalPagesEditor() {
  const { t } = useTranslation('admin');
  const [params, setParams] = useSearchParams();
  const requested = params.get('page');
  const slug: SitePageSlug = SITE_PAGE_SLUGS.includes(requested as SitePageSlug)
    ? (requested as SitePageSlug)
    : 'imprint';
  const pages = useQuery(api.sitePages.listForAdmin, {});
  const save = useMutation(api.sitePages.save);
  const current = pages?.find((page) => page.slug === slug);
  const info = LEGAL_PAGES[slug];
  const isSingle = runtimeConfig.mode === 'single';
  const { plausible } = useInstanceConfig();

  const [title, setTitle] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Load the saved text when switching pages or after the first load
  const loadedKey = current ? `${slug}:${current.version ?? 0}` : null;
  useEffect(() => {
    if (!current) return;
    setTitle(current.title ?? info.title);
    setMarkdown(current.markdown ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedKey]);

  const isDirty =
    !!current && (title !== (current.title ?? info.title) || markdown !== (current.markdown ?? ''));
  const showsPlaceholders = hasPlaceholders(markdown);

  const loadTemplate = () => {
    if (markdown.trim() && !window.confirm(t('legal.replaceWithTemplate'))) return;
    setTitle(info.title);
    setMarkdown(isSingle ? info.template : info.bazarpro);
  };

  const submit = async () => {
    setIsSaving(true);
    try {
      const version = await save({ slug, title, markdown });
      toast.success(t('legal.saved', { title: info.title, version }));
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t('legal.title')} description={t('legal.subtitle')} />

      <FilterTabs
        value={slug}
        onChange={(value) => {
          if (isDirty && !window.confirm(t('legal.discard'))) return;
          setParams({ page: value });
        }}
        options={SITE_PAGE_SLUGS.map((value) => {
          const page = pages?.find((p) => p.slug === value);
          return {
            value,
            label: LEGAL_PAGES[value].tab,
            count: page && (!page.version || page.hasPlaceholders) ? 1 : undefined,
          };
        })}
      />

      {pages === undefined ? null : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>
              {current?.version
                ? current.updatedByName
                  ? t('legal.versionBy', {
                      version: current.version,
                      date: formatDateTime(current.updatedAt!),
                      name: current.updatedByName,
                    })
                  : t('legal.version', {
                      version: current.version,
                      date: formatDateTime(current.updatedAt!),
                    })
                : isSingle
                  ? t('legal.missingSingle')
                  : t('legal.missingPlatform')}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1" onClick={loadTemplate}>
                <FileText className="h-4 w-4" />
                {isSingle ? t('legal.loadTemplate') : t('legal.loadBazarPro')}
              </Button>
              <Button variant="ghost" size="sm" className="gap-1" asChild>
                <a href={info.path} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" /> {t('legal.view')}
                </a>
              </Button>
            </div>
          </div>

          {showsPlaceholders && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                <Trans i18nKey="legal.placeholders" ns="admin" components={{ code: <code /> }} />
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="legal-title">{t('legal.titleLabel')}</Label>
            <Input id="legal-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="legal-markdown">{t('legal.text')}</Label>
              <textarea
                id="legal-markdown"
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                className="min-h-[60vh] w-full rounded-md border bg-background p-3 font-mono text-sm"
                placeholder={t('legal.textPlaceholder')}
              />
              <p className="text-xs text-muted-foreground">
                <Trans
                  i18nKey="legal.markdownHint"
                  ns="admin"
                  values={{
                    directive: ANALYTICS_DIRECTIVE,
                    state: plausible ? t('legal.analyticsOn') : t('legal.analyticsOff'),
                  }}
                  components={{ code: <code /> }}
                />
              </p>
            </div>
            <div className="space-y-2">
              <Label>{t('legal.preview')}</Label>
              <div className="min-h-[60vh] rounded-md border bg-card p-4">
                <h1 className="mb-6 text-2xl font-bold">{title}</h1>
                <SafeMarkdown
                  content={applyLegalDirectives(markdown, plausible)}
                  className={LEGAL_MARKDOWN_CLASSES}
                />
              </div>
            </div>
          </div>

          <Button onClick={submit} disabled={isSaving || !isDirty}>
            {isSaving ? t('legal.saving') : t('legal.save')}
          </Button>
        </>
      )}
    </div>
  );
}
