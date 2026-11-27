import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Megaphone, PackageOpen, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import { useMutation } from '../../lib/api/react';
import { api } from '../../lib/api/functions';
import type { Id } from '../../lib/api/types';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { Button } from '../ui/button';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { Label } from '../ui/label';
import { Textarea } from '../ui/text-area';

/** Longest message, as the backend takes it (`MAX_UNREGISTER_MESSAGE`) */
const MAX_MESSAGE = 1000;

/**
 * Above the seller list filtered to sellers without items (#304): how many they are, and
 * for the organizer a reminder to them all or unregistering them all, e.g. so their
 * places at a full bazaar become free.
 */
export function SellersWithoutItems({
  eventId,
  count,
  canAct,
  over,
  onRemind,
}: {
  eventId: Id<'events'>;
  count: number;
  /** The organizer; helpers only see the list */
  canAct: boolean;
  /** Nobody is unregistered after the bazaar */
  over: boolean;
  onRemind: () => void;
}) {
  const { t } = useTranslation('organizer');
  const unregister = useMutation(api.eventSeller.removeSellersWithoutItems);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  if (count === 0) {
    return (
      <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
        {t('sellers.withoutItemsNone')}
      </p>
    );
  }

  const confirm = async (event: React.MouseEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const removed = await unregister({ eventId, message: message.trim() || undefined });
      toast.success(
        removed > 0 ? t('sellers.unregistered', { count: removed }) : t('sellers.unregisteredNone')
      );
      setOpen(false);
      setMessage('');
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-warning-soft-foreground/30 bg-warning-soft p-4 sm:flex-row sm:items-center"
      data-testid="sellers-without-items"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning-soft-foreground">
        <PackageOpen className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{t('sellers.withoutItemsCount', { count })}</p>
        <p className="text-sm text-muted-foreground">{t('sellers.withoutItemsHint')}</p>
      </div>
      {canAct && (
        <div className="flex gap-2 *:flex-1 sm:*:flex-none">
          <Button variant="outline" className="gap-2" onClick={onRemind}>
            <Megaphone className="h-4 w-4" /> {t('sellers.remindWithoutItems')}
          </Button>
          <Button
            variant="outline"
            className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={over}
            onClick={() => setOpen(true)}
          >
            <UserMinus className="h-4 w-4" /> {t('sellers.unregisterWithoutItems')}
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('sellers.unregisterTitle', { count })}
        description={t('sellers.unregisterText')}
        confirmLabel={t('sellers.unregisterConfirm', { count })}
        onConfirm={confirm}
        destructive
        loading={busy}
        disabled={busy}
      >
        <div className="space-y-2">
          <Label htmlFor="unregister-message">{t('sellers.unregisterMessage')}</Label>
          <Textarea
            id="unregister-message"
            rows={3}
            maxLength={MAX_MESSAGE}
            value={message}
            placeholder={t('sellers.unregisterMessagePlaceholder')}
            onChange={(event) => setMessage(event.target.value)}
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}
