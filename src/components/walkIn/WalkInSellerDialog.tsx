import { useEffect, useState } from 'react';
import { useMutation } from '../../lib/api/react';
import { toast } from 'sonner';
import { api } from '../../lib/api/functions';
import type { Id } from '../../lib/api/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { useTranslation } from 'react-i18next';

/** Organizer registers a seller who came without an account. */
export function WalkInSellerDialog({
  eventId,
  open,
  onOpenChange,
  onCreated,
}: {
  eventId: Id<'events'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (sellerId: Id<'users'>) => void;
}) {
  const { t } = useTranslation('organizer');
  const createSeller = useMutation(api.walkInSellers.createWalkInSeller);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFirstName('');
      setLastName('');
      setEmail('');
      setPhone('');
    }
  }, [open]);

  const submit = async () => {
    setIsSaving(true);
    try {
      const sellerId = await createSeller({
        eventId,
        firstName,
        lastName,
        contactEmail: email || undefined,
        phone: phone || undefined,
      });
      toast.success(t('walkIn.created', { name: `${firstName} ${lastName}` }));
      onOpenChange(false);
      onCreated(sellerId);
    } catch (error) {
      toast.error(t('walkIn.createFailed'), {
        description: getUserFacingErrorMessage(error),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>{t('walkIn.title')}</DialogTitle>
          <DialogDescription>{t('walkIn.text')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="walkin-first">{t('walkIn.firstName')}</Label>
              <Input
                id="walkin-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="walkin-last">{t('walkIn.lastName')}</Label>
              <Input
                id="walkin-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="walkin-phone">{t('walkIn.phone')}</Label>
            <Input
              id="walkin-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="walkin-email">{t('walkIn.email')}</Label>
            <Input
              id="walkin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('walkIn.emailHint')}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            {t('actions.cancel', { ns: 'common' })}
          </Button>
          <Button
            loading={isSaving}
            onClick={submit}
            disabled={isSaving || !firstName.trim() || !lastName.trim()}
          >
            {isSaving ? t('walkIn.creating') : t('walkIn.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
