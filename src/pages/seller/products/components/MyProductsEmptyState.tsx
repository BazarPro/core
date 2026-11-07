import { Plus, ShoppingBag, Zap } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { EmptyState } from '../../../../components/ui/empty-state';
import { useTranslation } from 'react-i18next';

/**
 * My Products without anything to show: nothing created yet, or nothing matches the filters.
 * A first item can be entered in full or quickly, e.g. many small ones without photos.
 */
export function MyProductsEmptyState({
  hasProducts,
  onCreateProduct,
  onQuickAdd,
}: {
  hasProducts: boolean;
  onCreateProduct: () => void;
  /** Missing while the quick entry is open */
  onQuickAdd?: () => void;
}) {
  const { t } = useTranslation('seller');
  if (hasProducts) return <EmptyState icon={ShoppingBag} title={t('empty.noMatches')} />;
  return (
    <EmptyState icon={ShoppingBag} title={t('empty.title')} text={t('empty.text')}>
      <Button variant={onQuickAdd ? 'outline' : 'default'} onClick={onCreateProduct}>
        <Plus className="mr-2 h-4 w-4" />
        {t('empty.create')}
      </Button>
      {onQuickAdd && (
        <Button onClick={onQuickAdd}>
          <Zap className="mr-2 h-4 w-4" />
          {t('quick.open')}
        </Button>
      )}
    </EmptyState>
  );
}
