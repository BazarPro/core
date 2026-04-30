import { FileDown, Tag, Trash2 } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
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

/**
 * Toolbar shown when one or more products are selected: displays count and bulk actions.
 */
interface MyProductsBulkActionsProps {
  selectedCount: number;
  onBulkAddToEvent: () => void;
  onBulkDelete: () => void;
  onBulkDownloadQR: () => void;
  isGeneratingPdf?: boolean;
}

export function MyProductsBulkActions({
  selectedCount,
  onBulkAddToEvent,
  onBulkDelete,
  onBulkDownloadQR,
  isGeneratingPdf = false,
}: MyProductsBulkActionsProps) {
  return (
    <div className="bg-card rounded-lg border p-4 mb-6 flex items-center justify-between flex-wrap gap-4">
      <div className="text-sm">
        {selectedCount} Produkt{selectedCount !== 1 ? 'e' : ''} ausgewählt
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={onBulkDownloadQR}
          disabled={isGeneratingPdf}
        >
          <FileDown className="mr-2 h-4 w-4" />
          {isGeneratingPdf ? 'PDF wird erstellt…' : 'QR-Codes als PDF'}
        </Button>
        <Button variant="outline" size="sm" onClick={onBulkAddToEvent}>
          <Tag className="mr-2 h-4 w-4" />
          Zu Event hinzufügen
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Trash2 className="mr-2 h-4 w-4" />
              Löschen
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Bist du sicher?</AlertDialogTitle>
              <AlertDialogDescription>
                Diese Aktion kann nicht rückgängig gemacht werden. Alle ausgewählten Produkte werden
                dauerhaft gelöscht und aus allen Events entfernt.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={onBulkDelete}>Löschen</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
