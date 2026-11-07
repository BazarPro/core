import { PageHeader } from '../../../../components/ui/page-header';
import { Plus, Printer, ShoppingBasket, Zap } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { useTranslation } from 'react-i18next';

/**
 * Header section for the My Products page: title and actions.
 */

interface MyProductsPageHeaderProps {
  onCreateProduct: () => void;
  /** Opens the quick entry; missing while it is open */
  onQuickAdd?: () => void;
  /** Missing while there is nothing to label */
  onPrintLabels?: () => void;
  /** Missing without a sorting mark or a bazaar with universal labels */
  onPrintBasketLabel?: () => void;
}

export function MyProductsPageHeader({
  onCreateProduct,
  onQuickAdd,
  onPrintLabels,
  onPrintBasketLabel,
}: MyProductsPageHeaderProps) {
  const { t } = useTranslation('seller');
  return (
    <PageHeader
      className="mb-8"
      title={t('header.title')}
      actions={
        <div className="flex flex-wrap gap-2">
          {onPrintBasketLabel && (
            <Button
              size="lg"
              variant="outline"
              title={t('labels.basketHint')}
              onClick={onPrintBasketLabel}
            >
              <ShoppingBasket className="mr-2 h-5 w-5" />
              {t('labels.basket')}
            </Button>
          )}
          {onPrintLabels && (
            <Button size="lg" variant="outline" onClick={onPrintLabels}>
              <Printer className="mr-2 h-5 w-5" />
              {t('labels.open')}
            </Button>
          )}
          {onQuickAdd && (
            <Button size="lg" variant="soft" onClick={onQuickAdd} title={t('quick.openHint')}>
              <Zap className="mr-2 h-5 w-5" />
              {t('quick.open')}
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
