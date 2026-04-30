import { useCallback, useState, useEffect } from 'react';
import { useDropzone, type FileRejection, type Accept } from 'react-dropzone';
import { Upload, X } from 'lucide-react';
import { Button } from './button';
import { normalizeImageForUpload } from '../../lib/imageProcessing';

interface ImageUploadProps {
  onFilesChange: (files: File[]) => void;
  initialImageUrls?: string[];
  onRemoveExistingImage?: (index: number) => void;
  maxFiles?: number;
  accept?: Accept;
}

export function ImageUpload({
  onFilesChange,
  initialImageUrls = [],
  onRemoveExistingImage,
  maxFiles = 3,
  accept = { 'image/*': ['.jpeg', '.jpg', '.png', '.webp'] },
}: ImageUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [rejected, setRejected] = useState<FileRejection[]>([]);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [displayedInitialImageUrls, setDisplayedInitialImageUrls] =
    useState<string[]>(initialImageUrls);

  useEffect(() => {
    setDisplayedInitialImageUrls(initialImageUrls);
  }, [initialImageUrls]);

  const onDrop = useCallback(
    async (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      setProcessingError(null);
      const currentTotalFiles = displayedInitialImageUrls.length + files.length;
      const filesToAdd = acceptedFiles.slice(0, maxFiles - currentTotalFiles);

      try {
        const normalizedFiles = await Promise.all(
          filesToAdd.map((file) => normalizeImageForUpload(file))
        );
        const newFiles = [...files, ...normalizedFiles];
        setFiles(newFiles);
        onFilesChange(newFiles);
      } catch (error) {
        setProcessingError('Mindestens ein Bild konnte nicht verarbeitet werden.');
        console.error('Failed to process images before upload:', error);
      }

      setRejected(fileRejections);
    },
    [files, displayedInitialImageUrls, maxFiles, onFilesChange]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxFiles: maxFiles - displayedInitialImageUrls.length, // Adjust maxFiles for new uploads
  });

  const removeNewFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
    onFilesChange(newFiles);
  };

  const removeExistingImage = (index: number) => {
    if (onRemoveExistingImage) {
      onRemoveExistingImage(index);
    }
    setDisplayedInitialImageUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const totalFiles = displayedInitialImageUrls.length + files.length;

  return (
    <div>
      <div className="grid grid-cols-3 gap-4">
        {displayedInitialImageUrls.map((url, index) => (
          <div
            key={`initial-${index}`}
            className="relative aspect-square rounded-lg overflow-hidden"
          >
            <img src={url} alt={`Existing ${index}`} className="w-full h-full object-cover" />
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-1 right-1 h-6 w-6"
              onClick={() => removeExistingImage(index)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}

        {files.map((file, index) => (
          <div key={file.name} className="relative aspect-square rounded-lg overflow-hidden">
            <img
              src={URL.createObjectURL(file)}
              alt={`Preview ${file.name}`}
              className="w-full h-full object-cover"
              onLoad={(e) => URL.revokeObjectURL(e.currentTarget.src)}
            />
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-1 right-1 h-6 w-6"
              onClick={() => removeNewFile(index)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}

        {totalFiles < maxFiles && (
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg aspect-square flex flex-col items-center justify-center cursor-pointer transition-colors
              ${isDragActive ? 'bg-primary/10 border-primary' : 'hover:bg-muted/50'}`}
          >
            <input {...getInputProps()} />
            <Upload className="h-6 w-6 text-muted-foreground mb-1" />
            <span className="text-xs text-center text-muted-foreground px-2">
              {isDragActive ? 'Bild hier ablegen' : 'Hochladen oder hierher ziehen'}
            </span>
          </div>
        )}
      </div>
      {rejected.length > 0 && (
        <div className="text-destructive text-sm mt-2">
          Einige Dateien wurden abgelehnt. Erlaubt sind JPG, PNG und WEBP.
        </div>
      )}
      {processingError && <div className="text-destructive text-sm mt-2">{processingError}</div>}
    </div>
  );
}
