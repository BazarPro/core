import { useFormContext } from 'react-hook-form';
import { Label } from '../../../../components/ui/label';
import { ImageUpload } from '../../../../components/ui/ImageUpload';
import type { Id } from '../../../../../convex/_generated/dataModel';

interface MyProductEditImagesProps {
  existingImageUrls: string[];
  setExistingImageIds: (ids: Id<'_storage'>[]) => void;
  existingImageIds: Id<'_storage'>[];
}

export function MyProductEditImages({
  existingImageUrls,
  setExistingImageIds,
  existingImageIds,
}: MyProductEditImagesProps) {
  const {
    setValue,
    formState: { errors },
    trigger,
    getValues,
  } = useFormContext();

  const handleFilesChange = (files: File[]) => {
    setValue('imageFiles', files, { shouldDirty: true, shouldValidate: true });
  };

  const handleRemoveExistingImage = (index: number) => {
    const newExistingImageIds = existingImageIds.filter((_, i) => i !== index);
    setExistingImageIds(newExistingImageIds);
    setValue('imageFiles', getValues('imageFiles'), { shouldValidate: true });
    void trigger('imageFiles');
  };

  const imageError =
    errors.imageFiles && 'message' in errors.imageFiles ? errors.imageFiles.message : undefined;

  return (
    <div className="bg-card rounded-lg border p-6 space-y-6">
      <div className="space-y-2">
        <Label>Bilder *</Label>
        <ImageUpload
          onFilesChange={handleFilesChange}
          initialImageUrls={existingImageUrls}
          onRemoveExistingImage={handleRemoveExistingImage}
        />
        {imageError && <p className="text-sm text-destructive">{String(imageError)}</p>}
      </div>
    </div>
  );
}
