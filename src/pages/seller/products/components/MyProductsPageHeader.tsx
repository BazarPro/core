import { Plus } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { useTranslation } from 'react-i18next';

/**
 * Header section for the My Products page: title, subtitle, and "New product" button.
 */

interface MyProductsPageHeaderProps {
  onCreateProduct: () => void;
}

export function MyProductsPageHeader({ onCreateProduct }: MyProductsPageHeaderProps) {
  const { t } = useTranslation('seller');
  return (
    <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-4xl mb-2">{t('header.title')}</h1>
        <p className="text-muted-foreground">{t('header.subtitle')}</p>
      </div>
      <Button size="lg" onClick={onCreateProduct} data-onboarding-id="my-products-new-product">
        <Plus className="mr-2 h-5 w-5" />
        {t('header.newProduct')}
      </Button>
    </div>
  );
}
