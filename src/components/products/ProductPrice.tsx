import { useTranslation } from 'react-i18next';
import type { SaleInfo } from '../../lib/api/types';
import { cn, formatPriceDE } from '../../lib/utils';
import { formatItemPrice } from '../../lib/productDisplay';
import { priceSourceLabel } from '../../lib/saleBreakdown';
import { discountedPrice } from '../../shared/eventFeatures';

const CENT = 0.005;

export interface PriceInfo {
  price: number;
  /** Seller discount at the running bazaar */
  discountPercent?: number;
  sold?: boolean;
  /** Sold items of the seller: what the buyer paid and the payout */
  sale?: SaleInfo;
}

/**
 * The price of an item in every state it can be in: as listed, free, reduced by the
 * seller's discount, or sold (paid price, how it came about, and the payout for the
 * seller). `size` follows the place: `sm` in list rows, `md` on cards.
 */
export function ProductPrice({
  item,
  size = 'md',
  align = 'start',
  showPayout = true,
  showPercent = true,
  className,
}: {
  item: PriceInfo;
  size?: 'sm' | 'md';
  align?: 'start' | 'end';
  showPayout?: boolean;
  /** Off where a badge on the photo shows the discount already */
  showPercent?: boolean;
  className?: string;
}) {
  const { t } = useTranslation('seller');
  const main = size === 'sm' ? 'text-base font-semibold' : 'text-xl font-semibold';
  const aside = 'text-xs text-muted-foreground';
  const wrap = cn(
    'flex flex-col tabular-nums leading-tight',
    align === 'end' && 'items-end text-right',
    className
  );

  if (item.sale) {
    const { sale } = item;
    const reduced = sale.totalAmount < sale.listPrice - CENT;
    const source = reduced ? priceSourceLabel(sale) : null;
    return (
      <div className={wrap}>
        {reduced && (
          <span className={aside}>
            <span className="line-through">{formatItemPrice(sale.listPrice)}</span>
            {source && <> · {source}</>}
          </span>
        )}
        <span className={main}>{formatItemPrice(sale.totalAmount)}</span>
        {showPayout && (
          <span className={cn(aside, 'mt-0.5')}>
            {t('card.payout', { amount: formatPriceDE(sale.payout) })}
          </span>
        )}
      </div>
    );
  }

  const discount = !item.sold && item.discountPercent ? item.discountPercent : 0;
  if (discount > 0) {
    return (
      <div className={wrap}>
        <span className={aside}>
          <span className="line-through">{formatItemPrice(item.price)}</span>
          {showPercent && <> · −{discount} %</>}
        </span>
        <span className={cn(main, 'text-destructive')}>
          {formatItemPrice(discountedPrice(item.price, discount))}
        </span>
      </div>
    );
  }

  if (item.price === 0) {
    return (
      <div className={wrap}>
        <span className={cn(main, 'text-emerald-700 dark:text-emerald-400')}>
          {t('price.free')}
        </span>
      </div>
    );
  }

  return (
    <div className={wrap}>
      <span className={main}>{formatItemPrice(item.price)}</span>
    </div>
  );
}
