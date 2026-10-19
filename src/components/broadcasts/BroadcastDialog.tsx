import { useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { BroadcastAudience } from '../../../convex/constants';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/text-area';
import { getUserFacingErrorMessage } from '../../lib/errors';

const AUDIENCES: Record<BroadcastAudience, string> = {
  all: 'Alle Verkäufer',
  accepted: 'Nur Verkäufer mit abgegebenen Artikeln',
  pickup: 'Nur Verkäufer mit noch abzuholenden Artikeln',
};

/** Organizer writes to the sellers of the bazaar, e.g. "Abgabe erst ab 9 Uhr". */
export function BroadcastDialog({
  eventId,
  open,
  onOpenChange,
}: {
  eventId: Id<'events'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const send = useMutation(api.broadcasts.sendSellerBroadcast);
  const [audience, setAudience] = useState<BroadcastAudience>('all');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [important, setImportant] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const preview = useQuery(
    api.broadcasts.getBroadcastPreview,
    open ? { eventId, audience } : 'skip'
  );

  useEffect(() => {
    if (open) {
      setSubject('');
      setBody('');
      setImportant(false);
      setAudience('all');
    }
  }, [open]);

  const limitReached = preview?.left === 0;
  const canSend =
    subject.trim().length >= 3 &&
    body.trim().length >= 10 &&
    !!preview &&
    preview.recipients > 0 &&
    !limitReached &&
    !isSending;

  const submit = async () => {
    setIsSending(true);
    try {
      const count = await send({ eventId, subject, body, audience, important });
      toast.success(`Nachricht an ${count} Verkäufer verschickt`);
      onOpenChange(false);
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nachricht an Verkäufer</DialogTitle>
          <DialogDescription>
            Geht per Mail raus und steht auf der Basar-Seite der Verkäufer. Links bleiben als
            sichtbare Adresse im Text.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="broadcast-audience">Empfänger</Label>
            <select
              id="broadcast-audience"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={audience}
              onChange={(e) => setAudience(e.target.value as BroadcastAudience)}
            >
              {Object.entries(AUDIENCES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {preview && (
              <p className="text-xs text-muted-foreground">
                {preview.recipients} Verkäufer bekommen die Nachricht.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="broadcast-subject">Betreff</Label>
            <Input
              id="broadcast-subject"
              maxLength={120}
              value={subject}
              placeholder="z. B. Abgabe erst ab 9 Uhr"
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="broadcast-body">Nachricht</Label>
            <Textarea
              id="broadcast-body"
              rows={6}
              maxLength={5000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="flex items-start gap-3 rounded-md border p-3">
            <Checkbox
              id="broadcast-important"
              checked={important}
              disabled={preview?.importantLeft === 0}
              onCheckedChange={(checked) => setImportant(!!checked)}
            />
            <div className="space-y-1">
              <Label htmlFor="broadcast-important" className="cursor-pointer">
                Wichtig
              </Label>
              <p className="text-xs text-muted-foreground">
                Erreicht auch Verkäufer, die Nachrichten vom Veranstalter abbestellt haben, und ist
                in der Mail markiert. Höchstens eine wichtige Nachricht pro Tag
                {preview?.importantLeft === 0 ? ' – heute schon verschickt' : ''}.
              </p>
            </div>
          </div>
          {preview && (
            <p className="text-xs text-muted-foreground">
              {limitReached
                ? 'Für heute sind keine Nachrichten mehr möglich.'
                : `Heute noch ${preview.left} ${preview.left === 1 ? 'Nachricht' : 'Nachrichten'} möglich.`}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            Abbrechen
          </Button>
          <Button onClick={submit} disabled={!canSend}>
            {isSending
              ? 'Wird verschickt…'
              : preview
                ? `An ${preview.recipients} Verkäufer senden`
                : 'Senden'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
