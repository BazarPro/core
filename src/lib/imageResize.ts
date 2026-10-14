/** Longest side of photos taken in the quick entry; phone photos are much larger. */
const MAX_SIDE = 1600;

/**
 * Scales a photo down to at most 1600 px as JPEG before upload, so a series of
 * 40 phone photos does not mean hundreds of megabytes. Returns the original file
 * when it is small enough or the browser cannot decode it.
 */
export async function shrinkImage(file: File, maxSide = MAX_SIDE): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_000_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.82)
    );
    return blob ?? file;
  } catch {
    return file;
  }
}
