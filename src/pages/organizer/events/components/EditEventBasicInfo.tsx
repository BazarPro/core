import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Textarea } from '../../../../components/ui/text-area';
import { Button } from '../../../../components/ui/button';
import { ImageUpload } from '../../../../components/ui/ImageUpload';
import { SafeMarkdown } from '../../../../components/markdown/SafeMarkdown';
import { IMAGE_UPLOAD_MAX_HEIGHT, IMAGE_UPLOAD_MAX_WIDTH } from '../../../../lib/imageProcessing';

interface EditEventBasicInfoProps {
  initialCoverImageUrl?: string | null;
}

export function EditEventBasicInfo({ initialCoverImageUrl }: EditEventBasicInfoProps) {
  const {
    register,
    setValue,
    getValues,
    watch,
    formState: { errors },
  } = useFormContext();
  const [descriptionMode, setDescriptionMode] = useState<'edit' | 'preview'>('edit');
  const descriptionValue = watch('description') || '';
  const descriptionField = register('description');
  const initialImageUrls = initialCoverImageUrl ? [initialCoverImageUrl] : [];

  const handleFilesChange = (files: File[]) => {
    const nextFile = files[0];
    setValue('coverImageFile', nextFile ?? undefined, { shouldDirty: true });
    if (nextFile) {
      setValue('removeCoverImage', false, { shouldDirty: true });
      return;
    }
    if (initialCoverImageUrl) {
      setValue('removeCoverImage', true, { shouldDirty: true });
    }
  };

  const handleRemoveExistingImage = (index: number) => {
    void index;
    setValue('removeCoverImage', true, { shouldDirty: true });
    setValue('coverImageFile', undefined, { shouldDirty: true });
  };

  const insertMarkdown = (
    type: 'bold' | 'italic' | 'list' | 'link' | 'h2' | 'h3' | 'paragraph'
  ) => {
    const textarea = document.getElementById('description') as HTMLTextAreaElement | null;
    const current = getValues('description') || '';

    if (!textarea) {
      return;
    }

    const start = textarea.selectionStart ?? current.length;
    const end = textarea.selectionEnd ?? current.length;
    const selected = current.slice(start, end) || 'Text';

    let replacement = selected;
    switch (type) {
      case 'bold':
        replacement = `**${selected}**`;
        break;
      case 'italic':
        replacement = `*${selected}*`;
        break;
      case 'list':
        replacement = `- ${selected}`;
        break;
      case 'link':
        replacement = `[${selected}](https://example.com)`;
        break;
      case 'h2':
        replacement = `## ${selected}`;
        break;
      case 'h3':
        replacement = `### ${selected}`;
        break;
      case 'paragraph':
        replacement = `\n\n${selected}\n\n`;
        break;
    }

    const nextValue = `${current.slice(0, start)}${replacement}${current.slice(end)}`;
    setValue('description', nextValue, { shouldDirty: true, shouldTouch: true });

    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + replacement.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const handleDescriptionTab = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') {
      return;
    }
    e.preventDefault();

    const textarea = e.currentTarget;
    const current = getValues('description') || '';
    const start = textarea.selectionStart ?? current.length;
    const end = textarea.selectionEnd ?? current.length;
    const replacement = '  ';
    const nextValue = `${current.slice(0, start)}${replacement}${current.slice(end)}`;

    setValue('description', nextValue, { shouldDirty: true, shouldTouch: true });
    requestAnimationFrame(() => {
      const cursor = start + replacement.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  return (
    <div className="bg-card rounded-lg border p-6 space-y-6">
      <h2 className="text-2xl">Grundinformationen</h2>

      <div className="space-y-2" data-onboarding-id="event-form-title">
        <Label htmlFor="title">Titel der Veranstaltung *</Label>
        <Input id="title" {...register('title')} placeholder="z.B. Skibasar Muenchen 2025" />
        {errors.title && <p className="text-red-500 text-sm">{errors.title.message as string}</p>}
      </div>

      <div className="space-y-2">
        <Label>Titelbild</Label>
        <ImageUpload
          onFilesChange={handleFilesChange}
          initialImageUrls={initialImageUrls}
          onRemoveExistingImage={handleRemoveExistingImage}
          maxFiles={1}
        />
        <p className="text-xs text-muted-foreground">
          Bilder werden automatisch auf max. {IMAGE_UPLOAD_MAX_WIDTH}x{IMAGE_UPLOAD_MAX_HEIGHT}px
          verkleinert und komprimiert.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Label htmlFor="description">Beschreibung *</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={descriptionMode === 'edit' ? 'default' : 'outline'}
              onClick={() => setDescriptionMode('edit')}
            >
              Bearbeiten
            </Button>
            <Button
              type="button"
              size="sm"
              variant={descriptionMode === 'preview' ? 'default' : 'outline'}
              onClick={() => setDescriptionMode('preview')}
            >
              Vorschau
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => insertMarkdown('h2')}>
            H2
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => insertMarkdown('h3')}>
            H3
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => insertMarkdown('paragraph')}
          >
            Absatz
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => insertMarkdown('bold')}>
            Fett
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => insertMarkdown('italic')}
          >
            Kursiv
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => insertMarkdown('list')}>
            Liste
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => insertMarkdown('link')}>
            Link
          </Button>
        </div>

        {descriptionMode === 'edit' ? (
          <Textarea
            id="description"
            {...descriptionField}
            rows={10}
            className="min-h-64 leading-relaxed"
            onKeyDown={handleDescriptionTab}
            onBlur={(e) => {
              const sanitized = e.target.value.replace(/\t/g, '  ');
              if (sanitized !== e.target.value) {
                setValue('description', sanitized, { shouldDirty: true, shouldTouch: true });
              }
              descriptionField.onBlur(e);
            }}
          />
        ) : (
          <div className="min-h-64 rounded-md border bg-muted/30 p-4">
            {descriptionValue.trim() ? (
              <SafeMarkdown
                content={descriptionValue}
                className="leading-relaxed space-y-3 [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-5 [&_h1]:text-2xl [&_h2]:text-xl [&_h3]:text-lg"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Noch keine Beschreibung vorhanden. Wechsle zu "Bearbeiten", um Inhalte zu erfassen.
              </p>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Markdown erlaubt z. B. Ueberschriften (<code>##</code>, <code>###</code>), Absaetze,
          <code>**fett**</code>, <code>*kursiv*</code>, Listen mit <code>- </code> und Links wie
          <code>[Text](https://...)</code>.
        </p>
        {errors.description && (
          <p className="text-red-500 text-sm">{errors.description.message as string}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="location">Ort *</Label>
        <Input id="location" {...register('location')} />
        {errors.location && (
          <p className="text-red-500 text-sm">{errors.location.message as string}</p>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="startDate">Startdatum *</Label>
          <Input id="startDate" type="datetime-local" {...register('startDate')} />
          {errors.startDate && (
            <p className="text-red-500 text-sm">{errors.startDate.message as string}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="endDate">Enddatum *</Label>
          <Input id="endDate" type="datetime-local" {...register('endDate')} />
          {errors.endDate && (
            <p className="text-red-500 text-sm">{errors.endDate.message as string}</p>
          )}
        </div>
      </div>
    </div>
  );
}
