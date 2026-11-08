import { Plus, ShoppingBag } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { EmptyState } from '../../../../components/ui/empty-state';
import { useTranslation } from 'react-i18next';

/**
 * My Products without anything to show: nothing created yet, or nothing matches the filters.
 */
export function MyProductsEmptyState({
  hasProducts,
  onCreateProduct,
}: {
  hasProducts: boolean;
  onCreateProduct: () => void;
}) {
  const { t } = useTranslation('seller');
  if (hasProducts) return <EmptyState icon={ShoppingBag} title={t('empty.noMatches')} />;
  return (
    <EmptyState icon={ShoppingBag} title={t('empty.title')} text={t('empty.text')}>
      <Button onClick={onCreateProduct}>
        <Plus className="mr-2 h-4 w-4" />
        {t('empty.create')}
      </Button>
    </EmptyState>
  );
}
