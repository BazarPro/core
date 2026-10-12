import { Badge } from '../../../../components/ui/badge';
import { formatPriceDE } from '../../../../lib/utils';
import { CONDITION_OPTIONS } from '../../../../constants/records';

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
}: {
  title: string;
  price: number;
  condition?: string;
  sold?: boolean;
  categoryName?: string;
  discountPercent?: number;
}) {
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
            <span className="text-3xl sm:text-4xl font-bold text-destructive">
              {formatPriceDE(discountedPrice)} €
            </span>
            <span className="pb-1 text-muted-foreground line-through">
              {formatPriceDE(price)} €
            </span>
            <Badge variant="destructive" className="mb-1.5">
              -{discountPercent}% Rabatt
            </Badge>
          </>
        ) : (
          <span className="text-3xl sm:text-4xl font-bold">{formatPriceDE(price)} €</span>
        )}
        {sold && (
          <Badge variant="destructive" className="mb-1.5">
            Verkauft
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
  attributeList?: { label: string; value: string }[];
}) {
  return (
    <div className="space-y-8">
      {attributeList.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Details</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border text-sm sm:[&>div:last-child:nth-child(odd)]:col-span-2">
            {attributeList.map((row) => (
              <div key={row.label} className="bg-card px-4 py-3">
                <dt className="text-xs text-muted-foreground">{row.label}</dt>
                <dd className="font-medium break-words">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Beschreibung</h2>
        <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
          {description ? description : 'Keine Beschreibung vorhanden'}
        </p>
      </section>
    </div>
  );
}
