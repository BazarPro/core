import { useNavigate } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { Button } from '../../../../components/ui/button';
import { Edit, Trash2, Lock, Percent } from 'lucide-react';
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

interface PublicProductOwnerActionsProps {
  productId: Id<'products'>;
  onDelete: () => void;
  onUpdateDiscount?: () => void;
  isOngoingEvent?: boolean;
  isAvailable?: boolean;
}

export function PublicProductOwnerActions({
  productId,
  onDelete,
  onUpdateDiscount,
  isOngoingEvent = false,
  isAvailable = false,
}: PublicProductOwnerActionsProps) {
  const navigate = useNavigate();

  const isLocked = useQuery(api.eventProducts.isProductLockedForSeller, { productId });

  const canEdit = !isLocked;
  const canDelete = !isLocked;

  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm">
      <h3 className="mb-4 font-semibold text-lg">Verwaltung</h3>

      {isLocked && (
        <Alert variant="warning" className="mb-4">
          <Lock />
          <AlertDescription>
            Dieses Produkt ist gesperrt, da es bereits bei einem Event angenommen oder verkauft
            wurde.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-4">
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

        {isOngoingEvent && isAvailable && onUpdateDiscount && (
          <Button variant="secondary" className="w-full gap-2" onClick={onUpdateDiscount}>
            <Percent className="h-4 w-4" />
            Rabatt anpassen
          </Button>
        )}
      </div>
    </div>
  );
}
