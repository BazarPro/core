import { ArrowRight, Printer, Recycle, ScanEye, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PrintedLabel } from '../../../../components/products/PrintedLabel';
import { docsUrl } from '../../../../lib/links';
import { SectionHeading } from './MarketingHero';

/** Prices as on the labels of a kids' bazaar, without the euro sign */
const EXAMPLE_PRICES = [4, 8, 6];

/** Any code gives a realistic mark. */
const EXAMPLE_SORT_CODE = 66_647;

const STEPS: { icon: LucideIcon; id: 'sort' | 'reuse' | 'print' }[] = [
  { icon: ScanEye, id: 'sort' },
  { icon: Recycle, id: 'reuse' },
  { icon: Printer, id: 'print' },
];

/** Explains universal labels with labels as they are printed, in every theme on white. */
export function UniversalLabelSection({ eyebrow }: { eyebrow?: string } = {}) {
  const { t, i18n } = useTranslation('company');
  const items = t('featuresPage.universalLabel.exampleItems', {
    returnObjects: true,
  }) as string[];
  const sizes = t('featuresPage.universalLabel.exampleSizes', {
    returnObjects: true,
  }) as string[];

  return (
    <section className="pb-20 sm:pb-24">
      <div className="container mx-auto max-w-5xl px-4">
        <SectionHeading
          eyebrow={eyebrow ?? t('featuresPage.universalLabel.eyebrow')}
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
            {/* As printed, the layout of the PDF: QR code, sorting mark, title, size and price */}
            {items.map((title, index) => (
              <PrintedLabel
                key={title}
                format="small"
                label={{
                  title,
                  size: sizes[index],
                  price: EXAMPLE_PRICES[index] ?? 5,
                  sortCode: EXAMPLE_SORT_CODE,
                }}
                className="w-full rounded-sm shadow-md ring-1 ring-black/10"
              />
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
