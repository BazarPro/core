export const IMAGE_UPLOAD_MIME_TYPE = 'image/webp';
export const IMAGE_UPLOAD_MAX_WIDTH = 1600;
export const IMAGE_UPLOAD_MAX_HEIGHT = 1200;
export const IMAGE_UPLOAD_QUALITY = 0.82;

interface NormalizeImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  mimeType?: string;
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  return 'img';
}

function fileNameForMimeType(originalName: string, mimeType: string): string {
  const baseName = originalName.replace(/\.[^/.]+$/, '');
  const extension = extensionForMimeType(mimeType);
  return `${baseName}.${extension}`;
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'));
      img.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Bild konnte nicht verarbeitet werden.'));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

export async function normalizeImageForUpload(
  file: File,
  options: NormalizeImageOptions = {}
): Promise<File> {
  const maxWidth = options.maxWidth ?? IMAGE_UPLOAD_MAX_WIDTH;
  const maxHeight = options.maxHeight ?? IMAGE_UPLOAD_MAX_HEIGHT;
  const quality = options.quality ?? IMAGE_UPLOAD_QUALITY;
  const mimeType = options.mimeType ?? IMAGE_UPLOAD_MIME_TYPE;

  const image = await loadImage(file);
  const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
  const targetWidth = Math.max(1, Math.round(image.width * scale));
  const targetHeight = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas-Kontext konnte nicht erstellt werden.');
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);
  const blob = await canvasToBlob(canvas, mimeType, quality);

  return new File([blob], fileNameForMimeType(file.name, mimeType), {
    type: mimeType,
    lastModified: Date.now(),
  });
}
