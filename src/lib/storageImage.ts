import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

type ConvexQueryClient = {
  query: (
    query: typeof api.products.getImageUrls,
    args: { storageIds: Id<'_storage'>[] }
  ) => Promise<string[] | undefined>;
};

export async function imageUrlToDataUrl(imageUrl: string): Promise<string> {
  const res = await fetch(imageUrl);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image blob'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

export async function getStorageImageDataUrl(
  convex: ConvexQueryClient,
  storageId?: Id<'_storage'>
): Promise<string | undefined> {
  if (!storageId) return undefined;

  const imageUrls = (await convex.query(api.products.getImageUrls, {
    storageIds: [storageId],
  })) as string[] | undefined;

  const imageUrl = imageUrls?.[0];
  if (!imageUrl) return undefined;

  return await imageUrlToDataUrl(imageUrl);
}

