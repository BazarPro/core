import { IdCard } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import type { VendorWithCalculations } from '../../lib/api/types';

/**
 * Bazaars with fixedSellerData: name and address as they will be recorded with the first
 * accepted item, to compare with the ID card before the intake.
 */
export function SellerIdCheck({ seller }: { seller: VendorWithCalculations }) {
  const { t } = useTranslation('organizer');
  const name = [seller.firstName, seller.lastName].filter(Boolean).join(' ') || seller.name;
  const place = [seller.zipCode, seller.city].filter(Boolean).join(' ');
  return (
    <Alert variant="warning">
      <IdCard />
      <AlertTitle>{t('products.idCheckTitle')}</AlertTitle>
      <AlertDescription>
        <div className="font-medium text-foreground">
          {name && <div>{name}</div>}
          {seller.street && <div>{seller.street}</div>}
          {place && <div>{place}</div>}
          {seller.country && <div>{seller.country}</div>}
        </div>
        <p>{t('products.idCheckText')}</p>
      </AlertDescription>
    </Alert>
  );
}
