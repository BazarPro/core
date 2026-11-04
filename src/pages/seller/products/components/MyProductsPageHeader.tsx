import { PageHeader } from '../../../../components/ui/page-header';
import { Plus, Printer } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { useTranslation } from 'react-i18next';

/**
 * Header section for the My Products page: title and actions.
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
    <PageHeader
      className="mb-8"
      title={t('header.title')}
      actions={
        <div className="flex flex-wrap gap-2">
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
      }
    />
  );
}
