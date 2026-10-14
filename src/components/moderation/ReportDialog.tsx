import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useConvexAuth, useMutation } from 'convex/react';
import { toast } from 'sonner';
import { Flag } from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import { REPORT_REASONS, type ReportReason, type ReportTarget } from '../../../convex/constants';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Textarea } from '../ui/text-area';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { REPORT_REASON_LABELS, REPORT_TARGET_LABELS } from '../../lib/moderation';
import { cn } from '../../lib/utils';

interface ReportButtonProps {
  targetType: ReportTarget;
  targetId: string;
  /** Visible label; icon only when empty */
  label?: string;
  className?: string;
}

/**
 * "Melden" link that opens the report form. Anyone can report content to the platform
 * administrators; visitors without an account leave an email address for the answer.
 */
export function ReportButton({
  targetType,
  targetId,
  label = 'Melden',
  className,
}: ReportButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn('h-auto gap-1.5 px-2 py-1 text-xs text-muted-foreground', className)}
        onClick={() => setOpen(true)}
        aria-label={label || `${REPORT_TARGET_LABELS[targetType]} melden`}
        data-testid={`report-${targetType}`}
      >
        <Flag className="h-3.5 w-3.5" />
        {label}
      </Button>
      {open && (
        <ReportDialog
          targetType={targetType}
          targetId={targetId}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}

function ReportDialog({
  targetType,
  targetId,
  open,
  onOpenChange,
}: {
  targetType: ReportTarget;
  targetId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { isAuthenticated } = useConvexAuth();
  const report = useMutation(api.moderation.reportContent);
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [details, setDetails] = useState('');
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);

  const canSend =
    reason !== '' && details.trim().length >= 10 && (isAuthenticated || email.trim() !== '');

  const submit = async () => {
    if (!reason) return;
    setIsSending(true);
    try {
      await report({
        targetType,
        targetId,
        reason,
        details,
        email: isAuthenticated ? undefined : email,
      });
      toast.success('Danke für deine Meldung', {
        description: 'Unser Team prüft den Inhalt und meldet sich bei dir.',
      });
      onOpenChange(false);
    } catch (error) {
      toast.error('Meldung nicht gesendet', { description: getUserFacingErrorMessage(error) });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{REPORT_TARGET_LABELS[targetType]} melden</DialogTitle>
          <DialogDescription>
            Verstößt dieser Inhalt gegen Gesetze oder unsere Regeln? Unser Moderationsteam prüft
            jede Meldung und informiert dich über die Entscheidung.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Grund</Label>
            <RadioGroup value={reason} onValueChange={(value) => setReason(value as ReportReason)}>
              {REPORT_REASONS.map((value) => (
                <label key={value} className="flex cursor-pointer items-center gap-3 text-sm">
                  <RadioGroupItem
                    value={value}
                    id={`report-reason-${value}`}
                    className="border-muted-foreground/60"
                  />
                  {REPORT_REASON_LABELS[value]}
                </label>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="report-details">Was ist das Problem?</Label>
            <Textarea
              id="report-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Beschreibe kurz und möglichst genau, was nicht in Ordnung ist."
              rows={4}
              maxLength={2000}
            />
          </div>

          {!isAuthenticated && (
            <div className="space-y-2">
              <Label htmlFor="report-email">Deine E-Mail-Adresse</Label>
              <Input
                id="report-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@beispiel.de"
              />
              <p className="text-xs text-muted-foreground">
                Nur für unsere Rückmeldung. Mehr dazu in der{' '}
                <Link to="/privacy" className="underline">
                  Datenschutzerklärung
                </Link>
                .
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={submit} disabled={!canSend || isSending}>
            Meldung senden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
