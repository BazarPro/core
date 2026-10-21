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
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation('seller');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('bulkEvents.title', { count: selectedCount })}</DialogTitle>
          <DialogDescription>{t('bulkEvents.description')}</DialogDescription>
        </DialogHeader>
        <div className="py-3 space-y-4">
          <MyProductSelectEvents
            selectedEvents={selectedEventIds}
            onEventsChange={onSelectedEventsChange}
            hideDisclaimer={true}
            description={t('bulkEvents.choose', { count: selectedCount })}
          />
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50/70 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 border border-amber-200/60 dark:border-amber-800/60">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="text-sm">{t('bulkEvents.warning')}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel', { ns: 'common' })}
          </Button>
          <Button onClick={onSave} disabled={isSubmitting}>
            {isSubmitting
              ? t('actions.saving', { ns: 'common' })
              : t('actions.save', { ns: 'common' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
