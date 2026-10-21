import { PackageSearch } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { useTranslation } from 'react-i18next';

/**
 * Reusable empty state for the public product view: no product selected or product not found.
 */
interface PublicProductEmptyStateProps {
  title: string;
  description: string;
  onGoHome: () => void;
}

export function PublicProductEmptyState({
  title,
  description,
  onGoHome,
}: PublicProductEmptyStateProps) {
  const { t } = useTranslation('product');
  return (
    <div>
      <div className="container mx-auto px-4 py-20 flex flex-col items-center justify-center text-center">
        <div className="bg-background p-6 rounded-full shadow-sm mb-6 border">
          <PackageSearch className="h-12 w-12 text-muted-foreground" />
        </div>
        <h2 className="text-3xl font-bold mb-2">{title}</h2>
        <p className="text-muted-foreground mb-8 max-w-md">{description}</p>
        <Button onClick={onGoHome} size="lg">
          {t('page.home')}
        </Button>
      </div>
    </div>
  );
}
