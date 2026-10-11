import { Badge } from '../../../../components/ui/badge';
import { formatPriceDE } from '../../../../lib/utils';
import { CONDITION_OPTIONS } from '../../../../constants/records';

/**
 * Displays product details: title, price, condition/category/sold badges, and description.
 */
interface PublicProductInfoProps {
  title: string;
  price: number;
  condition?: string;
  sold?: boolean;
  categoryName?: string;
  description?: string;
  productId?: string;
  discountPercent?: number;
  attributeList?: { label: string; value: string }[];
}

export function PublicProductInfo({
  title,
  price,
  condition,
  sold,
  categoryName,
  description,
  discountPercent,
  attributeList = [],
}: PublicProductInfoProps) {
  const discountedPrice = discountPercent ? price * (1 - discountPercent / 100) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">{title}</h1>

        <div className="flex flex-wrap items-baseline gap-3 mb-6">
          <div className="flex flex-col">
            {discountedPrice ? (
              <>
                <div className="text-sm sm:text-base text-muted-foreground line-through">
                  {formatPriceDE(price)} €
                </div>
                <div className="text-3xl sm:text-4xl font-bold text-destructive">
                  {formatPriceDE(discountedPrice)} €
                </div>
              </>
            ) : (
              <div className="text-3xl sm:text-4xl">{formatPriceDE(price)} €</div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {discountPercent && discountPercent > 0 && (
              <Badge variant="destructive" className="text-sm sm:text-base px-3 py-1">
                -{discountPercent}% Rabatt
              </Badge>
            )}
            {condition && (
              <Badge variant="secondary" className="text-sm sm:text-base px-3 py-1">
                {condition in CONDITION_OPTIONS
                  ? CONDITION_OPTIONS[condition as keyof typeof CONDITION_OPTIONS].title
                  : condition}
              </Badge>
            )}
            {sold && (
              <Badge variant="destructive" className="text-sm sm:text-base px-3 py-1">
                Verkauft
              </Badge>
            )}
          </div>
        </div>

        {categoryName && (
          <Badge variant="outline" className="mb-6">
            {categoryName}
          </Badge>
        )}
      </div>

      {attributeList.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-lg border p-4 text-sm">
          {attributeList.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="font-medium break-words">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div>
        <h2 className="text-2xl font-semibold mb-3">Beschreibung</h2>
        <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
          {description ? description : 'Keine Beschreibung vorhanden'}
        </p>
      </div>
    </div>
  );
}
