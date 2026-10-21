import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '../../lib/api/react';
import { toast } from 'sonner';
import { api } from '../../lib/api/functions';
import type { Id } from '../../lib/api/types';
import type { BroadcastAudience } from '../../shared/constants';
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
import { useTranslation } from 'react-i18next';

const AUDIENCES: BroadcastAudience[] = ['all', 'accepted', 'pickup'];

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
  const { t } = useTranslation('organizer');
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
      toast.success(t('broadcast.sent', { count }));
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
          <DialogTitle>{t('broadcast.title')}</DialogTitle>
          <DialogDescription>{t('broadcast.text')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="broadcast-audience">{t('broadcast.audience')}</Label>
            <select
              id="broadcast-audience"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={audience}
              onChange={(e) => setAudience(e.target.value as BroadcastAudience)}
            >
              {AUDIENCES.map((value) => (
                <option key={value} value={value}>
                  {t(`broadcast.${value}`)}
                </option>
              ))}
            </select>
            {preview && (
              <p className="text-xs text-muted-foreground">
                {t('broadcast.recipients', { count: preview.recipients })}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="broadcast-subject">{t('broadcast.subject')}</Label>
            <Input
              id="broadcast-subject"
              maxLength={120}
              value={subject}
              placeholder={t('broadcast.subjectPlaceholder')}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="broadcast-body">{t('broadcast.body')}</Label>
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
                {t('broadcast.important')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('broadcast.importantText', {
                  suffix: preview?.importantLeft === 0 ? t('broadcast.alreadySent') : '',
                })}
              </p>
            </div>
          </div>
          {preview && (
            <p className="text-xs text-muted-foreground">
              {limitReached
                ? t('broadcast.limitReached')
                : t('broadcast.left', { count: preview.left })}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            {t('actions.cancel', { ns: 'common' })}
          </Button>
          <Button onClick={submit} disabled={!canSend}>
            {isSending
              ? t('broadcast.sending')
              : preview
                ? t('broadcast.sendTo', { count: preview.recipients })
                : t('broadcast.send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
