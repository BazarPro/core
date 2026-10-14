import { useEffect, useState } from 'react';
import type { InventoryActionType } from '../../../../../hooks/useInventoryActions';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../../../components/ui/alert-dialog';
import { Label } from '../../../../../components/ui/label';
import { Input } from '../../../../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../../components/ui/select';
import type { Doc, Id } from '../../../../../../convex/_generated/dataModel';

interface InventoryConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: InventoryActionType | null;
  productTitle?: string;
  /** For “accept product” only: event location categories (empty / undefined = no dropdown). */
  locationCategories?: Doc<'eventLocationCategories'>[] | undefined;
  /** For “accept product” only: current organizer note (e.g. key board hook). */
  initialNote?: string;
  onConfirm: (options?: {
    locationCategoryId?: Id<'eventLocationCategories'>;
    internalNote?: string;
  }) => void | Promise<void>;
  isSubmitting?: boolean;
}

export function InventoryConfirmDialog({
  open,
  onOpenChange,
  type,
  productTitle,
  locationCategories,
  initialNote,
  onConfirm,
  isSubmitting,
}: InventoryConfirmDialogProps) {
  const [acceptLocation, setAcceptLocation] = useState<string>('none');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setAcceptLocation('none');
      setNote(initialNote ?? '');
    }
  }, [open, type, initialNote]);

  if (!type) return null;

  const getDialogContent = () => {
    switch (type) {
      case 'sell':
        return {
          title: 'Verkauf bestätigen',
          description: `Möchtest du "${productTitle}" wirklich als verkauft markieren? Dies erstellt einen Kaufbeleg und berechnet die Provision.`,
          actionLabel: 'Ja, verkaufen',
        };
      case 'return':
        return {
          title: 'Rückgabe bestätigen',
          description: `Möchtest du "${productTitle}" an den Verkäufer zurückgeben?`,
          actionLabel: 'Ja, zurückgeben',
        };
      case 'undoSale':
        return {
          title: 'Verkauf stornieren',
          description: `Möchtest du den Verkauf von "${productTitle}" wirklich stornieren? Der Kaufbeleg wird gelöscht und der Status auf "Verfügbar" zurückgesetzt.`,
          actionLabel: 'Verkauf stornieren',
        };
      case 'undoReturn':
        return {
          title: 'Rückgabe rückgängig machen',
          description: `Möchtest du die Rückgabe von "${productTitle}" rückgängig machen? Das Produkt wird wieder als "Verfügbar" markiert.`,
          actionLabel: 'Rückgängig machen',
        };
      case 'markAvailable':
        return {
          title: 'Produkt annehmen',
          description: `Möchtest du "${productTitle}" annehmen und als verfügbar markieren?`,
          actionLabel: 'Annehmen',
        };
      default:
        return {
          title: 'Aktion bestätigen',
          description: 'Bist du sicher, dass du diese Aktion ausführen möchtest?',
          actionLabel: 'Bestätigen',
        };
    }
  };

  const content = getDialogContent();
  const showLocationSelect =
    type === 'markAvailable' && locationCategories && locationCategories.length > 0;

  const runConfirm = () => {
    if (type === 'markAvailable') {
      void onConfirm({
        ...(acceptLocation !== 'none'
          ? { locationCategoryId: acceptLocation as Id<'eventLocationCategories'> }
          : {}),
        internalNote: note,
      });
    } else {
      void onConfirm();
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{content.title}</AlertDialogTitle>
          <AlertDialogDescription>{content.description}</AlertDialogDescription>
        </AlertDialogHeader>
        {showLocationSelect && (
          <div className="grid gap-2 py-2">
            <Label htmlFor="accept-location" className="text-foreground">
              Standort (optional)
            </Label>
            <Select
              value={acceptLocation}
              onValueChange={setAcceptLocation}
              disabled={isSubmitting}
            >
              <SelectTrigger id="accept-location" className="w-full">
                <SelectValue placeholder="Keine Zuordnung" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Keine Zuordnung</SelectItem>
                {locationCategories.map((c) => (
                  <SelectItem key={c._id} value={c._id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {type === 'markAvailable' && (
          <div className="grid gap-2 py-2">
            <Label htmlFor="accept-note" className="text-foreground">
              Interne Notiz (optional)
            </Label>
            <Input
              id="accept-note"
              value={note}
              maxLength={500}
              placeholder="z. B. Schlüssel an Haken 12"
              onChange={(e) => setNote(e.target.value)}
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              Nur für Veranstalter und Helfer sichtbar.
            </p>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              runConfirm();
            }}
            disabled={isSubmitting}
            className={
              type === 'undoSale' || type === 'return'
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : ''
            }
          >
            {isSubmitting ? 'Wird verarbeitet...' : content.actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
