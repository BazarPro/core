import type { ApiClient } from './api/client';
import type { Id } from './api/types';

/** Uploads files to the backend storage, one upload URL per file, and returns their storage ids. */
export async function uploadImages(
  client: ApiClient,
  files: File[],
  generateUploadUrl: () => Promise<string>
): Promise<Id<'_storage'>[]> {
  const storageIds: Id<'_storage'>[] = [];
  for (const file of files) {
    storageIds.push(await client.upload(await generateUploadUrl(), file));
  }
  return storageIds;
}
