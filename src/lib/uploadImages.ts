import type { Id } from '../../convex/_generated/dataModel';

/** Uploads files to Convex storage, one upload URL per file, and returns their storage ids. */
export async function uploadImages(
  files: File[],
  generateUploadUrl: () => Promise<string>
): Promise<Id<'_storage'>[]> {
  const storageIds: Id<'_storage'>[] = [];
  for (const file of files) {
    const result = await fetch(await generateUploadUrl(), {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    const { storageId } = await result.json();
    storageIds.push(storageId);
  }
  return storageIds;
}
