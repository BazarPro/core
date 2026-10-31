import { useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { useFormContext } from 'react-hook-form';
import { useMutation, useQuery } from '../../../../lib/api/react';
import { Trash2 } from 'lucide-react';
import { api } from '../../../../lib/api/functions';
import type { Doc, Id } from '../../../../lib/api/types';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { ImageUpload } from '../../../../components/ui/ImageUpload';
import { IMAGE_UPLOAD_MAX_HEIGHT, IMAGE_UPLOAD_MAX_WIDTH } from '../../../../lib/imageProcessing';
import { toast } from 'sonner';
import { getUserFacingErrorMessage } from '../../../../lib/errors';
import { useTranslation } from 'react-i18next';
import { Loading } from '../../../../components/ui/loading';
import { Skeleton } from '../../../../components/ui/skeleton';

interface EditEventMapSectionProps {
  eventId?: Id<'events'>;
  initialEventMapUrl?: string | null;
  pendingLocationCategories: string[];
  onPendingLocationCategoriesChange: (labels: string[]) => void;
  /** Without an account the picture could not be kept until the bazaar is created */
  allowMapImage?: boolean;
}

function ManagedLocationCategories({ eventId }: { eventId: Id<'events'> }) {
  const { t } = useTranslation('organizer');
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
      toast.error(t('map.createFailed'), {
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
      toast.error(t('map.saveFailed'), { description: getUserFacingErrorMessage(e) });
    }
  };

  const remove = async (categoryId: Id<'eventLocationCategories'>) => {
    try {
      await deleteCategory({ categoryId });
    } catch (e) {
      toast.error(t('map.deleteFailed'), { description: getUserFacingErrorMessage(e) });
    }
  };

  if (categories === undefined) {
    return (
      <Loading className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </Loading>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          placeholder={t('map.placeholder')}
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
          {t('map.add')}
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
                    {t('map.save')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingId(null)}
                  >
                    {t('actions.cancel', { ns: 'common' })}
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
                    {t('map.rename')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => void remove(c._id)}
                    aria-label={t('map.remove')}
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
        <p className="text-sm text-muted-foreground">{t('map.emptyHint')}</p>
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
  const { t } = useTranslation('organizer');
  const [draft, setDraft] = useState('');

  const add = () => {
    const label = draft.trim();
    if (!label) return;
    if (pendingLocationCategories.includes(label)) {
      setDraft('');
      return;
    }
    onPendingLocationCategoriesChange([...pendingLocationCategories, label]);
    setDraft('');
  };

  const removeAt = (index: number) => {
    onPendingLocationCategoriesChange(pendingLocationCategories.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          placeholder={t('map.pendingPlaceholder')}
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
          {t('map.addToList')}
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
        <p className="text-sm text-muted-foreground">{t('map.pendingHint')}</p>
      )}
    </div>
  );
}

export function EditEventMapSection({
  eventId,
  initialEventMapUrl,
  pendingLocationCategories,
  onPendingLocationCategoriesChange,
  allowMapImage = true,
}: EditEventMapSectionProps) {
  const { t } = useTranslation('organizer');
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
      <h2 className="text-2xl">{t('map.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('map.intro')}</p>

      {allowMapImage && (
        <div className="space-y-2">
          <Label>{t('map.image')}</Label>
          <ImageUpload
            onFilesChange={handleMapFilesChange}
            initialImageUrls={initialMapUrls}
            onRemoveExistingImage={handleRemoveExistingMap}
            maxFiles={1}
          />
          <p className="text-xs text-muted-foreground">
            {t('basic.imageHint', {
              width: IMAGE_UPLOAD_MAX_WIDTH,
              height: IMAGE_UPLOAD_MAX_HEIGHT,
            })}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label>{t('map.categories')}</Label>
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
