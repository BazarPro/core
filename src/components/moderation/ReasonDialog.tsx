import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Label } from '../ui/label';
import { Textarea } from '../ui/text-area';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { useTranslation } from 'react-i18next';

interface ReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  /** Receives the trimmed reason; the dialog closes when it resolves. */
  onConfirm: (reason: string) => Promise<void>;
  successMessage: string;
}

/**
 * Asks an administrator for the reason of a moderation decision. The reason is sent to
 * the person concerned (statement of reasons) and stored in the moderation log.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  successMessage,
}: ReasonDialogProps) {
  const { t } = useTranslation('admin');
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const submit = async () => {
    setIsSaving(true);
    try {
      await onConfirm(reason.trim());
      toast.success(successMessage);
      setReason('');
      onOpenChange(false);
    } catch (error) {
      toast.error(t('moderate.error'), { description: getUserFacingErrorMessage(error) });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="moderation-reason">{t('moderate.reason')}</Label>
          <Textarea
            id="moderation-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('moderate.reasonPlaceholder')}
            rows={4}
            maxLength={1000}
          />
          <p className="text-xs text-muted-foreground">{t('moderate.reasonHint')}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel', { ns: 'common' })}
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={reason.trim().length < 5 || isSaving}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
