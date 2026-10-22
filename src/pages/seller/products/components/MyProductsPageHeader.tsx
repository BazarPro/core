import { Plus, Printer } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { useTranslation } from 'react-i18next';

/**
 * Header section for the My Products page: title, subtitle, and "New product" button.
 */

interface MyProductsPageHeaderProps {
  onCreateProduct: () => void;
  /** Missing while there is nothing to label */
  onPrintLabels?: () => void;
}

export function MyProductsPageHeader({
  onCreateProduct,
  onPrintLabels,
}: MyProductsPageHeaderProps) {
  const { t } = useTranslation('seller');
  return (
    <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-4xl mb-2">{t('header.title')}</h1>
        <p className="text-muted-foreground">{t('header.subtitle')}</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        {onPrintLabels && (
          <Button size="lg" variant="outline" onClick={onPrintLabels}>
            <Printer className="mr-2 h-5 w-5" />
            {t('labels.open')}
          </Button>
        )}
        <Button size="lg" onClick={onCreateProduct} data-onboarding-id="my-products-new-product">
          <Plus className="mr-2 h-5 w-5" />
          {t('header.newProduct')}
        </Button>
      </div>
    </div>
  );
}
