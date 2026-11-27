import { IdCard } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { VendorWithCalculations } from '../../lib/api/types';
import { countryName } from '../../i18n/countries';

/**
 * Bazaars with fixedSellerData: name and address as they will be recorded with the first
 * accepted item, to compare with the ID card before the intake.
 */
export function SellerIdCheck({ seller }: { seller: VendorWithCalculations }) {
  const { t } = useTranslation('organizer');
  const name = [seller.firstName, seller.lastName].filter(Boolean).join(' ') || seller.name;
  const place = [seller.zipCode, seller.city].filter(Boolean).join(' ');
  return (
    <section
      aria-label={t('products.idCheckTitle')}
      className="rounded-lg border border-warning-soft-foreground/30 bg-warning-soft p-3"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-warning-soft-foreground">
        <IdCard className="h-4 w-4 shrink-0" />
        {t('products.idCheckTitle')}
      </div>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start">
        {/* Laid out like on the card, to hold it next to it */}
        <address className="shrink-0 rounded-md border bg-background px-3 py-2 text-sm not-italic leading-snug sm:min-w-56">
          {name && <div className="font-semibold">{name}</div>}
          {seller.street && <div>{seller.street}</div>}
          {place && <div>{place}</div>}
          {seller.country && (
            <div className="text-muted-foreground">{countryName(seller.country)}</div>
          )}
        </address>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('products.idCheckText')}</p>
      </div>
    </section>
  );
}
