import { useEffect, useState } from 'react';
import { useMutation } from 'convex/react';
import { toast } from 'sonner';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
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
      toast.success(`${firstName} ${lastName} wurde angelegt`);
      onOpenChange(false);
      onCreated(sellerId);
    } catch (error) {
      toast.error('Verkäufer konnte nicht angelegt werden', {
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
          <DialogTitle>Verkäufer ohne Konto anlegen</DialogTitle>
          <DialogDescription>
            Für Personen, die ohne Anmeldung zur Veranstaltung kommen. Du erfasst danach ihre
            Artikel. Ein Login für die Person entsteht dabei nicht.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="walkin-first">Vorname *</Label>
              <Input
                id="walkin-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="walkin-last">Nachname *</Label>
              <Input
                id="walkin-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="walkin-phone">Telefon</Label>
            <Input
              id="walkin-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="walkin-email">E-Mail (optional)</Label>
            <Input
              id="walkin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Dorthin geht die Nachricht, wenn ein Artikel verkauft wurde.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Abbrechen
          </Button>
          <Button onClick={submit} disabled={isSaving || !firstName.trim() || !lastName.trim()}>
            {isSaving ? 'Wird angelegt...' : 'Anlegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
