import { CheckCircle2, Github, GraduationCap, Heart, Linkedin, Server } from 'lucide-react';
import { useMemo } from 'react';
import { Footer } from '../../../components/layout/Footer';
import { Seo } from '../../../components/seo/Seo';
import { Button } from '../../../components/ui/button';
import { GITHUB_URL, selfHostUrl } from '../../../lib/links';
import { organization, softwareApplication } from '../../../lib/structuredData';
import { LandingCTA } from '../landing/components/LandingCTA';
import { MarketingHero, SectionHeading } from './components/MarketingHero';
import { useStartActions } from './components/useStartActions';
import { Trans, useTranslation } from 'react-i18next';

const TEAM = ['Henning von Besser', 'Johannes Staudenraus', 'Ivo Zeitz'];

const MILESTONES = ['study', 'done', 'today'] as const;

const STACK = [
  'React',
  'TypeScript',
  'Rust',
  'PostgreSQL',
  'Docker',
  'GitHub Actions',
  'Playwright',
];

export function AboutPage() {
  const { isAuthenticated, goToOrganizer, goToSeller } = useStartActions();
  const { t, i18n } = useTranslation('company');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the texts follow the language, and t changes with it
  const jsonLd = useMemo(() => [organization(), softwareApplication()], [t]);

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background">
      <Seo
        title={t('about.seoTitle')}
        description={t('about.seoDescription')}
        canonical="/about"
        jsonLd={jsonLd}
      />

      <main className="flex-grow">
        <MarketingHero
          eyebrow={t('about.eyebrow')}
          title={
            <Trans
              i18nKey="about.title"
              ns="company"
              components={{ highlight: <span className="text-primary" /> }}
            />
          }
          actions={
            <>
              <Button asChild size="lg" className="h-12 px-6 text-base font-semibold">
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                  <Github className="mr-2 h-5 w-5" />
                  {t('githubCode')}
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 px-6 text-base font-semibold"
              >
                <a
                  href={selfHostUrl(i18n.resolvedLanguage)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Server className="mr-2 h-5 w-5" />
                  {t('selfHost')}
                </a>
              </Button>
            </>
          }
        >
          {t('about.intro')}
        </MarketingHero>

        {/* Status */}
        <section className="pb-20 sm:pb-24">
          <div className="container mx-auto grid max-w-5xl gap-4 px-4 sm:grid-cols-3">
            <StatusCard
              icon={CheckCircle2}
              title={t('about.status.done.title')}
              text={t('about.status.done.text')}
            />
            <StatusCard
              icon={Heart}
              title={t('about.status.free.title')}
              text={t('about.status.free.text')}
            />
            <StatusCard
              icon={Github}
              title={t('about.status.openSource.title')}
              text={t('about.status.openSource.text')}
            />
          </div>
        </section>

        {/* Timeline */}
        <section className="bg-muted/40 py-20 sm:py-24">
          <div className="container mx-auto px-4">
            <SectionHeading eyebrow={t('about.history.eyebrow')} title={t('about.history.title')} />
            <ol className="mx-auto max-w-3xl space-y-0">
              {MILESTONES.map((milestone, index) => (
                <li key={milestone} className="relative flex gap-5 pb-10 last:pb-0">
                  {index < MILESTONES.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="absolute left-[1.15rem] top-10 h-[calc(100%-2.5rem)] w-px bg-border"
                    />
                  )}
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
                    {index + 1}
                  </span>
                  <div className="space-y-1.5 pt-1">
                    <p className="text-sm font-semibold uppercase tracking-wider text-primary">
                      {t(`about.milestones.${milestone}.label`)}
                    </p>
                    <h3 className="text-xl font-bold">
                      {t(`about.milestones.${milestone}.title`)}
                    </h3>
                    <p className="text-pretty leading-relaxed text-muted-foreground">
                      {t(`about.milestones.${milestone}.text`)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Team */}
        <section className="py-20 sm:py-24">
          <div className="container mx-auto px-4">
            <SectionHeading eyebrow={t('about.team.eyebrow')} title={t('about.team.title')}>
              {t('about.team.text')}
            </SectionHeading>

            <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-3">
              {TEAM.map((name) => (
                <div
                  key={name}
                  className="flex flex-col items-center rounded-[1.5rem] border bg-card p-6 text-center shadow-sm"
                >
                  <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
                    {initials(name)}
                  </span>
                  <h3 className="font-bold">{name}</h3>
                  <p className="text-sm text-muted-foreground">{t('about.team.role')}</p>
                </div>
              ))}
            </div>

            <div className="mx-auto mt-6 flex max-w-4xl flex-col items-center gap-4 rounded-[1.5rem] border bg-card p-6 text-center shadow-sm sm:flex-row sm:text-left">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <GraduationCap className="h-6 w-6" />
              </span>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">{t('about.team.supervisedBy')}</p>
                <p className="font-bold">Sven Patrick Meier & Kevin Michelfelder</p>
                <p className="text-sm text-muted-foreground">
                  SK Tech GmbH ·{' '}
                  <a
                    href="https://neuronity.de/de"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline-offset-4 hover:text-primary hover:underline"
                  >
                    Neuronity
                  </a>
                </p>
              </div>
              <a
                href="https://www.linkedin.com/company/neuronity-by-sk-tech/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground transition-colors hover:text-primary"
                title={t('about.team.linkedin')}
              >
                <Linkedin className="h-5 w-5" />
              </a>
            </div>
          </div>
        </section>

        {/* Contribute */}
        <section className="bg-muted/40 py-20 sm:py-24">
          <div className="container mx-auto px-4">
            <SectionHeading
              eyebrow={t('about.contribute.eyebrow')}
              title={t('about.contribute.title')}
            >
              {t('about.contribute.text')}
            </SectionHeading>
            <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-2">
              {STACK.map((tech) => (
                <span
                  key={tech}
                  className="rounded-full border bg-card px-4 py-1.5 text-sm font-medium shadow-sm"
                >
                  {tech}
                </span>
              ))}
            </div>
            <div className="mt-10 flex justify-center">
              <Button asChild size="lg" variant="outline" className="h-12 px-6 text-base">
                <a href={`${GITHUB_URL}/issues`} target="_blank" rel="noopener noreferrer">
                  <Github className="mr-2 h-5 w-5" />
                  {t('about.contribute.issues')}
                </a>
              </Button>
            </div>
          </div>
        </section>

        <LandingCTA
          isAuthenticated={isAuthenticated}
          onOrganizerClick={goToOrganizer}
          onSellerClick={goToSeller}
        />
      </main>

      <Footer />
    </div>
  );
}

function initials(name: string) {
  const parts = name.split(' ');
  return `${parts[0][0]}${parts[parts.length - 1][0]}`;
}

function StatusCard({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Heart;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-[1.5rem] border bg-card p-6 shadow-sm">
      <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <h2 className="mb-1.5 text-lg font-bold">{title}</h2>
      <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}
