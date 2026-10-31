import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { StickyNote } from 'lucide-react';
import type { Id } from '../../lib/api/types';
import { useOfflineIntake } from '../../lib/offlineActions';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { useTranslation } from 'react-i18next';

/**
 * Organizer-only note on an item in an event, e.g. the hook number on the key board.
 * Buyers and sellers never see it. Offline the app keeps it and saves it later.
 */
export function InternalNoteEditor({
  eventId,
  eventProductId,
  title,
  note,
  compact = false,
}: {
  eventId: Id<'events'>;
  eventProductId: Id<'eventProducts'>;
  /** The item, for a note the backend refuses after offline */
  title: string;
  note?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation('organizer');
  const intake = useOfflineIntake(eventId);
  const [value, setValue] = useState(note ?? '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => setValue(note ?? ''), [note]);

  const save = async () => {
    setIsSaving(true);
    try {
      const { queued } = await intake.run(
        { name: 'eventProducts.setEventProductNote', args: { eventProductId, note: value } },
        title
      );
      if (queued) toast.success(t('products.offline.saved'));
      else toast.success(value.trim() ? t('note.saved') : t('note.removed'));
    } catch (error) {
      toast.error(t('note.error'), { description: getUserFacingErrorMessage(error) });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
      {!compact && (
        <label className="flex items-center gap-1.5 text-sm font-medium">
          <StickyNote className="h-4 w-4" />
          {t('note.label')}
        </label>
      )}
      <div className="flex gap-2">
        <Input
          value={value}
          maxLength={500}
          placeholder={t('note.placeholder')}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
          aria-label={t('note.label')}
        />
        <Button
          variant="outline"
          onClick={save}
          disabled={isSaving || value.trim() === (note ?? '')}
        >
          {t('note.save')}
        </Button>
      </div>
      {!compact && <p className="text-xs text-muted-foreground">{t('note.hint')}</p>}
    </div>
  );
}
