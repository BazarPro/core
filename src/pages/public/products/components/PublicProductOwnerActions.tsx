import { useNavigate } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { Button } from '../../../../components/ui/button';
import type { ReactNode } from 'react';
import { Edit, Trash2, Lock, Percent, Store } from 'lucide-react';
import { Alert, AlertDescription } from '../../../../components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../../../components/ui/alert-dialog';
import { getDiscountButtonState } from '../../../../lib/discountRules';
import type { DiscountRules } from '../../../../../convex/products';
import { ProductRolePanel } from './ProductRolePanel';

interface PublicProductOwnerActionsProps {
  productId: Id<'products'>;
  onDelete: () => void;
  onUpdateDiscount?: () => void;
  isOngoingEvent?: boolean;
  isAvailable?: boolean;
  discountRules?: DiscountRules;
  /** Further seller tools, e.g. open price offers */
  children?: ReactNode;
}

export function PublicProductOwnerActions({
  productId,
  onDelete,
  onUpdateDiscount,
  isOngoingEvent = false,
  isAvailable = false,
  discountRules,
  children,
}: PublicProductOwnerActionsProps) {
  const navigate = useNavigate();

  const isLocked = useQuery(api.eventProducts.isProductLockedForSeller, { productId });

  const canEdit = !isLocked;
  const canDelete = !isLocked;
  const discountButton = getDiscountButtonState(discountRules);

  return (
    <ProductRolePanel icon={Store} title="Dein Artikel" role="participant" testId="seller-panel">
      {isLocked && (
        <Alert variant="warning">
          <Lock />
          <AlertDescription>
            Gesperrt, solange das Produkt bei einer Veranstaltung angenommen ist oder wenn es
            verkauft wurde. Nach der Rückgabe kannst du es wieder bearbeiten.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => navigate(`/products/edit/${productId}`)}
            disabled={!canEdit}
          >
            <Edit className="h-4 w-4" />
            Bearbeiten
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full gap-2" disabled={!canDelete}>
                <Trash2 className="h-4 w-4" />
                Löschen
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Bist du sicher?</AlertDialogTitle>
                <AlertDialogDescription>
                  Diese Aktion kann nicht rückgängig gemacht werden. Das Produkt wird dauerhaft aus
                  deinem Katalog und von allen Events entfernt.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete}>Löschen</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {isOngoingEvent && isAvailable && onUpdateDiscount && discountButton.visible && (
          <Button
            variant="secondary"
            className="w-full gap-2"
            onClick={onUpdateDiscount}
            disabled={discountButton.disabled}
          >
            <Percent className="h-4 w-4" />
            {discountButton.disabled ? discountButton.label : 'Rabatt anpassen'}
          </Button>
        )}
      </div>

      {children}
    </ProductRolePanel>
  );
}
