import { ImageOff, PackageX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '../../lib/api/react';
import { api } from '../../lib/api/functions';
import type { Id, MyRejection } from '../../lib/api/types';
import { StorageImage } from '../ui/StorageImage';

/**
 * The seller's items that were not handed in on time and so turned down, on the bazaar's
 * page beside the organizer's messages. Renders nothing while there are none.
 */
export function MyRejections({ eventId }: { eventId: Id<'events'> }) {
  const rejections = useQuery(api.eventProducts.getMyRejections, { eventId });
  if (!rejections || rejections.length === 0) return null;
  return <MyRejectionList rejections={rejections} />;
}

export function MyRejectionList({ rejections }: { rejections: MyRejection[] }) {
  const { t } = useTranslation('events');
  return (
    <section className="rounded-xl border bg-card p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <PackageX className="h-5 w-5 text-muted-foreground" />
        {t('rejections.title', { count: rejections.length })}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('rejections.hint', { count: rejections.length })}
      </p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {rejections.map((rejection) => (
          <li
            key={rejection.productId}
            className="flex min-w-0 max-w-full items-center gap-2 rounded-lg border bg-muted/30 py-1 pl-1 pr-3 text-sm"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
              {rejection.image ? (
                <StorageImage
                  storageId={rejection.image}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <ImageOff className="h-4 w-4 text-muted-foreground" />
              )}
            </span>
            <span className="truncate">{rejection.title}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
