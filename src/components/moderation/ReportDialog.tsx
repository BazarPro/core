import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthState, useMutation } from '../../lib/api/react';
import { toast } from 'sonner';
import { Flag } from 'lucide-react';
import { api } from '../../lib/api/functions';
import { REPORT_REASONS, type ReportReason, type ReportTarget } from '../../shared/constants';
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
import { Trans, useTranslation } from 'react-i18next';

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
export function ReportButton({ targetType, targetId, label, className }: ReportButtonProps) {
  const { t } = useTranslation('moderation');
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn('h-auto gap-1.5 px-2 py-1 text-xs text-muted-foreground', className)}
        onClick={() => setOpen(true)}
        aria-label={label || t('report.targetButton', { target: REPORT_TARGET_LABELS[targetType] })}
        data-testid={`report-${targetType}`}
      >
        <Flag className="h-3.5 w-3.5" />
        {label ?? t('report.button')}
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
  const { t } = useTranslation('moderation');
  const { isAuthenticated } = useAuthState();
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
      toast.success(t('report.thanks'), {
        description: t('report.thanksText'),
      });
      onOpenChange(false);
    } catch (error) {
      toast.error(t('report.failed'), { description: getUserFacingErrorMessage(error) });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t('report.targetButton', { target: REPORT_TARGET_LABELS[targetType] })}
          </DialogTitle>
          <DialogDescription>{t('report.intro')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label>{t('report.reason')}</Label>
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
            <Label htmlFor="report-details">{t('report.details')}</Label>
            <Textarea
              id="report-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={t('report.detailsPlaceholder')}
              rows={4}
              maxLength={2000}
            />
          </div>

          {!isAuthenticated && (
            <div className="space-y-2">
              <Label htmlFor="report-email">{t('report.email')}</Label>
              <Input
                id="report-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('report.emailPlaceholder')}
              />
              <p className="text-xs text-muted-foreground">
                <Trans
                  i18nKey="report.emailHint"
                  ns="moderation"
                  components={{ privacy: <Link to="/privacy" className="underline" /> }}
                />
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel', { ns: 'common' })}
          </Button>
          <Button onClick={submit} disabled={!canSend || isSending}>
            {t('report.send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
