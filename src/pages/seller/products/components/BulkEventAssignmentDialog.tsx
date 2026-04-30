import { AlertCircle } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../../components/ui/dialog';
import { MyProductSelectEvents } from './MyProductSelectEvents';

/**
 * Modal to assign multiple selected products to one or more events at once. Uses ProductEvents for event selection.
 */
interface BulkEventAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  selectedEventIds: string[];
  onSelectedEventsChange: (eventIds: string[]) => void;
  onSave: () => Promise<void>;
  isSubmitting: boolean;
}

export function BulkEventAssignmentDialog({
  open,
  onOpenChange,
  selectedCount,
  selectedEventIds,
  onSelectedEventsChange,
  onSave,
  isSubmitting,
}: BulkEventAssignmentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {selectedCount} {selectedCount === 1 ? 'Produkt' : 'Produkte'} zu Veranstaltungen
            hinzufügen
          </DialogTitle>
          <DialogDescription>
            Wähle die Veranstaltungen aus, zu denen die ausgewählten Produkte hinzugefügt werden
            sollen.
          </DialogDescription>
        </DialogHeader>
        <div className="py-3 space-y-4">
          <MyProductSelectEvents
            selectedEvents={selectedEventIds}
            onEventsChange={onSelectedEventsChange}
            hideDisclaimer={true}
            description={`Wähle die Veranstaltungen, bei denen du ${
              selectedCount === 1 ? 'dieses Produkt' : 'diese Produkte'
            } anbieten möchtest`}
          />
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50/70 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 border border-amber-200/60 dark:border-amber-800/60">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="text-sm">
              Achtung: Die Veranstaltungszuordnung wird für alle ausgewählten Produkte auf die hier
              getroffene Auswahl überschrieben.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={onSave} disabled={isSubmitting}>
            {isSubmitting ? 'Wird gespeichert…' : 'Speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
