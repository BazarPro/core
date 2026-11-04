import { ArrowRight, Printer, Recycle, ScanEye, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SortMarkBadge } from '../../../../components/sellers/SortMarkBadge';
import { QrCode } from '../../../../components/ui/QrCode';
import { docsUrl } from '../../../../lib/links';
import { SectionHeading } from './MarketingHero';

/** Any code gives a realistic mark. */
const EXAMPLE_SORT_CODE = 247;

const STEPS: { icon: LucideIcon; id: 'sort' | 'reuse' | 'print' }[] = [
  { icon: ScanEye, id: 'sort' },
  { icon: Recycle, id: 'reuse' },
  { icon: Printer, id: 'print' },
];

/** Explains universal labels with labels as they are printed, in every theme on white. */
export function UniversalLabelSection() {
  const { t, i18n } = useTranslation('company');
  const items = t('featuresPage.universalLabel.exampleItems', {
    returnObjects: true,
  }) as string[];

  return (
    <section className="pb-20 sm:pb-24">
      <div className="container mx-auto max-w-5xl px-4">
        <SectionHeading
          eyebrow={t('featuresPage.universalLabel.eyebrow')}
          title={t('featuresPage.universalLabel.title')}
        >
          {t('featuresPage.universalLabel.text')}
        </SectionHeading>
        <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
          <div
            role="img"
            aria-label={t('featuresPage.universalLabel.example')}
            className="mx-auto grid w-full max-w-sm gap-3"
          >
            {items.map((title) => (
              <div
                key={title}
                className="flex items-center gap-3 rounded-md bg-white p-2 text-zinc-900 shadow-md ring-1 ring-black/10"
              >
                <QrCode value="https://bazarpro.de" className="h-16 w-16 shrink-0" />
                <div className="min-w-0 flex-1">
                  <SortMarkBadge code={EXAMPLE_SORT_CODE} className="h-10" />
                  <p className="mt-1 truncate text-sm">{title}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-6">
            {STEPS.map(({ icon: Icon, id }) => (
              <div key={id} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="mb-1 font-semibold">
                    {t(`featuresPage.universalLabel.steps.${id}.title`)}
                  </h3>
                  <p className="text-pretty text-sm text-muted-foreground">
                    {t(`featuresPage.universalLabel.steps.${id}.text`)}
                  </p>
                </div>
              </div>
            ))}
            <p className="text-pretty text-sm text-muted-foreground">
              {t('featuresPage.universalLabel.default')}
            </p>
            <a
              href={docsUrl(i18n.resolvedLanguage, '/veranstalter/universal-etiketten/')}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              {t('featuresPage.universalLabel.guide')}
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
