import type { ItemKind } from '../components/illustrations/ItemIllustrations';

/*
 * Cover templates of the creation wizard (public/images/covers, source and how to render
 * them: scripts/event-covers). Choosing one needs no account: only the id waits in the
 * draft, the picture is uploaded like an own one when the bazaar is created.
 */

export const EVENT_COVERS = ['kids', 'clothing', 'ski', 'bike', 'market', 'pattern'] as const;
export type EventCoverId = (typeof EVENT_COVERS)[number];

/** Without a kind of bazaar: the one that fits every bazaar. */
export const DEFAULT_COVER: EventCoverId = 'market';

export const coverForKind = (kind: ItemKind): EventCoverId => kind;

export const coverUrl = (id: string) => `/images/covers/${id}.webp`;

export async function coverFile(id: string): Promise<File> {
  const response = await fetch(coverUrl(id));
  if (!response.ok) throw new Error(`Cover template ${id}: ${response.status}`);
  return new File([await response.blob()], `${id}.webp`, { type: 'image/webp' });
}
