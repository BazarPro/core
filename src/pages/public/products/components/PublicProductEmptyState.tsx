import { PackageSearch } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { EmptyState } from '../../../../components/ui/empty-state';
import { useTranslation } from 'react-i18next';

/** The public product view without a product: none selected, or not found. */
export function PublicProductEmptyState({
  title,
  description,
  onGoHome,
}: {
  title: string;
  description: string;
  onGoHome: () => void;
}) {
  const { t } = useTranslation('product');
  return (
    <div className="container mx-auto px-4 py-20">
      <EmptyState icon={PackageSearch} title={title} text={description}>
        <Button onClick={onGoHome}>{t('page.home')}</Button>
      </EmptyState>
    </div>
  );
}
