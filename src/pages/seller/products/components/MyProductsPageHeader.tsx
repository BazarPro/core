import { Plus } from 'lucide-react';
import { Button } from '../../../../components/ui/button';

/**
 * Header section for the My Products page: title, subtitle, and "New product" button.
 */

interface MyProductsPageHeaderProps {
  onCreateProduct: () => void;
}

export function MyProductsPageHeader({ onCreateProduct }: MyProductsPageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-4xl mb-2">Meine Produkte</h1>
        <p className="text-muted-foreground">Verwalte deine Produkte und QR-Codes</p>
      </div>
      <Button
        size="lg"
        onClick={onCreateProduct}
        data-onboarding-id="my-products-new-product"
      >
        <Plus className="mr-2 h-5 w-5" />
        Neues Produkt
      </Button>
    </div>
  );
}
