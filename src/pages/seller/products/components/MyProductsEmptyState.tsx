import { Plus, ShoppingBag } from 'lucide-react';
import { Button } from '../../../../components/ui/button';

/**
 * Empty state for the My Products list when no products match filters or exist
 */
interface MyProductsEmptyStateProps {
  onCreateProduct: () => void;
}

export function MyProductsEmptyState({ onCreateProduct }: MyProductsEmptyStateProps) {
  return (
    <div className="text-center py-12">
      <ShoppingBag className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
      <h3 className="text-xl mb-2">Keine Produkte gefunden</h3>
      <p className="text-muted-foreground mb-6">Erstelle dein erstes Produkt, um loszulegen</p>
      <Button onClick={onCreateProduct}>
        <Plus className="mr-2 h-4 w-4" />
        Neues Produkt erstellen
      </Button>
    </div>
  );
}
