import { ListPlus, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../../components/ui/button';

/**
 * Header section for the My Products page: title, subtitle, and "New product" button.
 */

interface MyProductsPageHeaderProps {
  onCreateProduct: () => void;
}

export function MyProductsPageHeader({ onCreateProduct }: MyProductsPageHeaderProps) {
  const navigate = useNavigate();
  return (
    <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-4xl mb-2">Meine Produkte</h1>
        <p className="text-muted-foreground">Verwalte deine Produkte und QR-Codes</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {/* Many items without photo at once, for bazaars that allow it */}
        <Button size="lg" variant="outline" onClick={() => navigate('/products/quick')}>
          <ListPlus className="mr-2 h-5 w-5" />
          Schnellerfassung
        </Button>
        <Button size="lg" onClick={onCreateProduct} data-onboarding-id="my-products-new-product">
          <Plus className="mr-2 h-5 w-5" />
          Neues Produkt
        </Button>
      </div>
    </div>
  );
}
