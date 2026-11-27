import { Badge } from '../../../../components/ui/badge';
import { cn, formatPrice } from '../../../../lib/utils';
import { CONDITION_OPTIONS } from '../../../../constants/records';
import { useTranslation } from 'react-i18next';
import { categoryFieldText } from '../../../../i18n/categoryFields';

function conditionTitle(condition: string) {
  return condition in CONDITION_OPTIONS
    ? CONDITION_OPTIONS[condition as keyof typeof CONDITION_OPTIONS].title
    : condition;
}

/** Title, price and status at the top of the buy box. */
export function PublicProductSummary({
  title,
  price,
  condition,
  sold,
  categoryName,
  discountPercent,
  negotiable,
}: {
  title: string;
  price: number;
  condition?: string;
  sold?: boolean;
  categoryName?: string;
  discountPercent?: number;
  /** VB: the price can be negotiated at the cash desk. */
  negotiable?: boolean;
}) {
  const { t } = useTranslation('product');
  const discountedPrice = discountPercent ? price * (1 - discountPercent / 100) : null;

  return (
    <div className="space-y-4">
      {(categoryName || condition) && (
        <div className="flex flex-wrap gap-2">
          {categoryName && <Badge variant="outline">{categoryName}</Badge>}
          {condition && <Badge variant="secondary">{conditionTitle(condition)}</Badge>}
        </div>
      )}

      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight break-words">{title}</h1>

      <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
        {discountedPrice ? (
          <>
            <span className="text-3xl sm:text-4xl font-bold tabular-nums">
              {formatPrice(discountedPrice)} €
            </span>
            <span className="pb-1 text-muted-foreground line-through tabular-nums">
              {formatPrice(price)} €
            </span>
            {/* The discount as a yellow tag like on the cards, not in red: red means an error */}
            <span className="mb-1.5 rounded-md bg-tag px-2 py-0.5 text-xs font-bold text-tag-foreground">
              {t('info.discount', { percent: discountPercent })}
            </span>
          </>
        ) : (
          <span
            className={cn(
              'text-3xl sm:text-4xl font-bold',
              price === 0 && 'text-success-soft-foreground'
            )}
          >
            {price === 0 ? t('price.free', { ns: 'seller' }) : `${formatPrice(price)} €`}
          </span>
        )}
        {negotiable && !sold && (
          <Badge
            variant="outline"
            className="mb-1.5 border-primary/40 text-primary"
            title={t('info.negotiableTitle')}
          >
            {t('info.negotiable')}
          </Badge>
        )}
        {sold && (
          <Badge variant="secondary" className="mb-1.5">
            {t('info.sold')}
          </Badge>
        )}
      </div>
    </div>
  );
}

/** Category fields and description below the gallery. */
export function PublicProductDetails({
  description,
  attributeList = [],
}: {
  description?: string;
  attributeList?: { label: string; labelEn?: string; value: string }[];
}) {
  const { t } = useTranslation('product');
  return (
    <div className="space-y-8">
      {attributeList.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">{t('info.details')}</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border text-sm sm:[&>div:last-child:nth-child(odd)]:col-span-2">
            {attributeList.map((row) => (
              <div key={row.label} className="bg-card px-4 py-3">
                <dt className="text-xs text-muted-foreground">
                  {categoryFieldText(row, 'label') ?? row.label}
                </dt>
                <dd className="font-medium break-words">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* Small items often have none; an empty heading would only fill space */}
      {description?.trim() && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">{t('info.description')}</h2>
          <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{description}</p>
        </section>
      )}
    </div>
  );
}
