import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '../../lib/api/functions';
import { useMutation } from '../../lib/api/react';
import type { Id, VendorWithCalculations } from '../../lib/api/types';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { EMAIL_PATTERN } from '../../shared/constants';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';

/** The organizer invites someone by mail, as seller or helper; the account follows later. */
export function InviteDialog({
  eventId,
  vendors,
  open,
  onOpenChange,
}: {
  eventId: Id<'events'>;
  vendors: VendorWithCalculations[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('organizer');
  const send = useMutation(api.eventInvitations.send);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'seller' | 'helper'>('seller');
  const [isSending, setIsSending] = useState(false);

  const address = email.trim().toLowerCase();
  const participant = vendors.find((vendor) => vendor.email?.toLowerCase() === address);
  // A seller can still be asked to help, which the mail then offers
  const alreadyIn = !!participant && (role === 'seller' || !!participant.isHelper);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!EMAIL_PATTERN.test(address) || alreadyIn) return;
    setIsSending(true);
    try {
      await send({ eventId, email: address, helper: role === 'helper' });
      toast.success(t('inviteDialog.sent', { email: address }));
      setEmail('');
      onOpenChange(false);
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('inviteDialog.title')}</DialogTitle>
          <DialogDescription>{t('inviteDialog.text')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">{t('inviteDialog.email')}</Label>
            <Input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            {alreadyIn && <p className="text-xs text-destructive">{t('inviteDialog.alreadyIn')}</p>}
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('inviteDialog.role')}</legend>
            <RadioGroup
              value={role}
              onValueChange={(value) => setRole(value as 'seller' | 'helper')}
            >
              {(['seller', 'helper'] as const).map((option) => (
                <Label
                  key={option}
                  htmlFor={`invite-${option}`}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal"
                >
                  <RadioGroupItem id={`invite-${option}`} value={option} className="mt-0.5" />
                  <span>
                    <span className="block font-medium">{t(`inviteDialog.${option}`)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t(`inviteDialog.${option}Hint`)}
                    </span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </fieldset>
          <p className="text-xs text-muted-foreground">{t('inviteDialog.consent')}</p>
          <Button
            type="submit"
            className="w-full"
            loading={isSending}
            disabled={isSending || alreadyIn}
          >
            {t('inviteDialog.send')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
