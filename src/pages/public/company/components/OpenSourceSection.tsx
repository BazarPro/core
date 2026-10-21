import { BookOpen, Github, Server } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { docsUrl, GITHUB_URL, selfHostUrl } from '../../../../lib/links';
import { useTranslation } from 'react-i18next';

/** Open-source band shared by the features, pricing and about pages. */
export function OpenSourceSection() {
  const { t, i18n } = useTranslation('company');
  return (
    <section className="py-20 sm:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto grid max-w-5xl items-center gap-10 rounded-[2rem] border bg-card p-8 shadow-sm sm:p-12 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">
              {t('openSource.eyebrow')}
            </p>
            <h2 className="text-balance text-3xl font-bold tracking-tight">
              {t('openSource.title')}
            </h2>
            <p className="text-pretty text-lg text-muted-foreground">{t('openSource.text')}</p>
          </div>
          <div className="flex flex-col gap-3">
            <Button asChild size="lg" className="h-12 justify-start text-base">
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                <Github className="mr-3 h-5 w-5" />
                {t('githubCode')}
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 justify-start text-base">
              <a
                href={selfHostUrl(i18n.resolvedLanguage)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Server className="mr-3 h-5 w-5" />
                {t('openSource.selfHostGuide')}
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 justify-start text-base">
              <a href={docsUrl(i18n.resolvedLanguage)} target="_blank" rel="noopener noreferrer">
                <BookOpen className="mr-3 h-5 w-5" />
                {t('openSource.docs')}
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
