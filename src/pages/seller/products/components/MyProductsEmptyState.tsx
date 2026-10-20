import { Plus, ShoppingBag } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { useTranslation } from 'react-i18next';

/**
 * Empty state for the My Products list when no products match filters or exist
 */
interface MyProductsEmptyStateProps {
  onCreateProduct: () => void;
}

export function MyProductsEmptyState({ onCreateProduct }: MyProductsEmptyStateProps) {
  const { t } = useTranslation('seller');
  return (
    <div className="text-center py-12">
      <ShoppingBag className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
      <h3 className="text-xl mb-2">{t('empty.title')}</h3>
      <p className="text-muted-foreground mb-6">{t('empty.text')}</p>
      <Button onClick={onCreateProduct}>
        <Plus className="mr-2 h-4 w-4" />
        {t('empty.create')}
      </Button>
    </div>
  );
}
