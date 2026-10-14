import { useEffect, useState } from 'react';
import { useMutation } from 'convex/react';
import { toast } from 'sonner';
import { StickyNote } from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { getUserFacingErrorMessage } from '../../lib/errors';

/**
 * Organizer-only note on an item in an event, e.g. the hook number on the key board.
 * Buyers and sellers never see it.
 */
export function InternalNoteEditor({
  eventProductId,
  note,
  compact = false,
}: {
  eventProductId: Id<'eventProducts'>;
  note?: string;
  compact?: boolean;
}) {
  const setNote = useMutation(api.eventProducts.setEventProductNote);
  const [value, setValue] = useState(note ?? '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => setValue(note ?? ''), [note]);

  const save = async () => {
    setIsSaving(true);
    try {
      await setNote({ eventProductId, note: value });
      toast.success(value.trim() ? 'Notiz gespeichert' : 'Notiz entfernt');
    } catch (error) {
      toast.error('Fehler', { description: getUserFacingErrorMessage(error) });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
      {!compact && (
        <label className="flex items-center gap-1.5 text-sm font-medium">
          <StickyNote className="h-4 w-4" />
          Interne Notiz
        </label>
      )}
      <div className="flex gap-2">
        <Input
          value={value}
          maxLength={500}
          placeholder="z. B. Schlüssel an Haken 12"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
          aria-label="Interne Notiz"
        />
        <Button
          variant="outline"
          onClick={save}
          disabled={isSaving || value.trim() === (note ?? '')}
        >
          Speichern
        </Button>
      </div>
      {!compact && (
        <p className="text-xs text-muted-foreground">Nur für Veranstalter und Helfer sichtbar.</p>
      )}
    </div>
  );
}
