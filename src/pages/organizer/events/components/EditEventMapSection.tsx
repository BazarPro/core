import { useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { useFormContext } from 'react-hook-form';
import { useMutation, useQuery } from 'convex/react';
import { Trash2 } from 'lucide-react';
import { api } from '../../../../../convex/_generated/api';
import type { Doc, Id } from '../../../../../convex/_generated/dataModel';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { ImageUpload } from '../../../../components/ui/ImageUpload';
import { IMAGE_UPLOAD_MAX_HEIGHT, IMAGE_UPLOAD_MAX_WIDTH } from '../../../../lib/imageProcessing';
import { toast } from 'sonner';
import { getUserFacingErrorMessage } from '../../../../lib/errors';

interface EditEventMapSectionProps {
  eventId?: Id<'events'>;
  initialEventMapUrl?: string | null;
  pendingLocationCategories: string[];
  onPendingLocationCategoriesChange: (labels: string[]) => void;
}

function ManagedLocationCategories({ eventId }: { eventId: Id<'events'> }) {
  const categories = useQuery(api.eventLocationCategories.listForEvent, { eventId });
  const createCategory = useMutation(api.eventLocationCategories.createCategory);
  const updateLabel = useMutation(api.eventLocationCategories.updateCategoryLabel);
  const deleteCategory = useMutation(api.eventLocationCategories.deleteCategory);

  const [newLabel, setNewLabel] = useState('');
  const [editingId, setEditingId] = useState<Id<'eventLocationCategories'> | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleAdd = async () => {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    try {
      await createCategory({ eventId, label: trimmed });
      setNewLabel('');
    } catch (e) {
      toast.error('Kategorie konnte nicht angelegt werden', {
        description: getUserFacingErrorMessage(e),
      });
    }
  };

  const startEdit = (id: Id<'eventLocationCategories'>, label: string) => {
    setEditingId(id);
    setEditValue(label);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      await updateLabel({ categoryId: editingId, label: editValue });
      setEditingId(null);
    } catch (e) {
      toast.error('Speichern fehlgeschlagen', { description: getUserFacingErrorMessage(e) });
    }
  };

  const remove = async (categoryId: Id<'eventLocationCategories'>) => {
    try {
      await deleteCategory({ categoryId });
    } catch (e) {
      toast.error('Löschen fehlgeschlagen', { description: getUserFacingErrorMessage(e) });
    }
  };

  if (categories === undefined) {
    return <p className="text-sm text-muted-foreground">Standortkategorien werden geladen…</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          placeholder="z. B. Reihe 1, Halle 2"
          value={newLabel}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setNewLabel(e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleAdd();
            }
          }}
        />
        <Button type="button" variant="secondary" onClick={() => void handleAdd()}>
          Hinzufügen
        </Button>
      </div>
      <ul className="space-y-2">
        {categories.map((c: Doc<'eventLocationCategories'>) => (
          <li
            key={c._id}
            className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-md border p-2"
          >
            {editingId === c._id ? (
              <>
                <Input
                  className="flex-1"
                  value={editValue}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setEditValue(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={() => void saveEdit()}>
                    Speichern
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingId(null)}
                  >
                    Abbrechen
                  </Button>
                </div>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm">{c.label}</span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => startEdit(c._id, c.label)}
                  >
                    Umbenennen
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => void remove(c._id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      {categories.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Füge Standortkategorien hinzu. Du kannst diese später zu Produkten zuordnen, so dass die
          Besucher deiner Veranstaltung diese schneller finden.
        </p>
      )}
    </div>
  );
}

function PendingLocationCategories({
  pendingLocationCategories,
  onPendingLocationCategoriesChange,
}: {
  pendingLocationCategories: string[];
  onPendingLocationCategoriesChange: (labels: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const t = draft.trim();
    if (!t) return;
    if (pendingLocationCategories.includes(t)) {
      setDraft('');
      return;
    }
    onPendingLocationCategoriesChange([...pendingLocationCategories, t]);
    setDraft('');
  };

  const removeAt = (index: number) => {
    onPendingLocationCategoriesChange(pendingLocationCategories.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          placeholder="z. B. Reihe 1, Raum 23a"
          value={draft}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="secondary" onClick={add}>
          Zur Liste hinzufügen
        </Button>
      </div>
      <ul className="space-y-1">
        {pendingLocationCategories.map((label, i) => (
          <li
            key={`${label}-${i}`}
            className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
          >
            <span>{label}</span>
            <Button type="button" size="sm" variant="ghost" onClick={() => removeAt(i)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
      {pendingLocationCategories.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nach dem Erstellen der Veranstaltung werden diese Kategorien gespeichert. Du kannst sie
          später unter &quot;Bearbeiten&quot; ändern.
        </p>
      )}
    </div>
  );
}

export function EditEventMapSection({
  eventId,
  initialEventMapUrl,
  pendingLocationCategories,
  onPendingLocationCategoriesChange,
}: EditEventMapSectionProps) {
  const { setValue } = useFormContext();
  const initialMapUrls = initialEventMapUrl ? [initialEventMapUrl] : [];

  const handleMapFilesChange = (files: File[]) => {
    const nextFile = files[0];
    setValue('eventMapImageFile', nextFile ?? undefined, { shouldDirty: true });
    if (nextFile) {
      setValue('removeEventMapImage', false, { shouldDirty: true });
      return;
    }
    if (initialEventMapUrl) {
      setValue('removeEventMapImage', true, { shouldDirty: true });
    }
  };

  const handleRemoveExistingMap = () => {
    setValue('removeEventMapImage', true, { shouldDirty: true });
    setValue('eventMapImageFile', undefined, { shouldDirty: true });
  };

  return (
    <div className="bg-card rounded-lg border p-6 space-y-6">
      <h2 className="text-2xl">Lageplan und Standortkategorien</h2>
      <p className="text-sm text-muted-foreground">
        Optional: Lade einen Lageplan der Veranstaltung hoch (z. B. mit Ständen, Reihen, etc.) so
        dass Besucher sich schneller orientieren können.
      </p>

      <div className="space-y-2">
        <Label>Lageplan / Karte (Bild)</Label>
        <ImageUpload
          onFilesChange={handleMapFilesChange}
          initialImageUrls={initialMapUrls}
          onRemoveExistingImage={handleRemoveExistingMap}
          maxFiles={1}
        />
        <p className="text-xs text-muted-foreground">
          Bilder werden automatisch auf max. {IMAGE_UPLOAD_MAX_WIDTH}x{IMAGE_UPLOAD_MAX_HEIGHT}px
          verkleinert und komprimiert.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Standortkategorien</Label>
        {eventId ? (
          <ManagedLocationCategories eventId={eventId} />
        ) : (
          <PendingLocationCategories
            pendingLocationCategories={pendingLocationCategories}
            onPendingLocationCategoriesChange={onPendingLocationCategoriesChange}
          />
        )}
      </div>
    </div>
  );
}
