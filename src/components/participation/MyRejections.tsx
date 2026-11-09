import { Ban, ImageOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '../../lib/api/react';
import { api } from '../../lib/api/functions';
import type { Id, MyRejection } from '../../lib/api/types';
import { dateLocale } from '../../i18n/format';
import { StorageImage } from '../ui/StorageImage';

/**
 * The seller's items the team turned down at this bazaar, on the bazaar's page beside the
 * organizer's messages. Renders nothing while there are none.
 */
export function MyRejections({ eventId }: { eventId: Id<'events'> }) {
  const rejections = useQuery(api.eventProducts.getMyRejections, { eventId });
  if (!rejections || rejections.length === 0) return null;
  return <MyRejectionList rejections={rejections} />;
}

export function MyRejectionList({ rejections }: { rejections: MyRejection[] }) {
  const { t } = useTranslation('events');
  return (
    <section className="rounded-xl border border-destructive/30 bg-card p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Ban className="h-5 w-5 text-destructive" />
        {t('rejections.title', { count: rejections.length })}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('rejections.hint')}</p>
      <ul className="mt-4 divide-y">
        {rejections.map((rejection) => (
          <li key={rejection.productId} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
              {rejection.image ? (
                <StorageImage
                  storageId={rejection.image}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <ImageOff className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="truncate font-medium">{rejection.title}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(rejection.rejectedAt).toLocaleDateString(dateLocale(), {
                    dateStyle: 'medium',
                  })}
                </span>
              </p>
              {rejection.reason ? (
                <p className="mt-1 whitespace-pre-line break-words text-sm">
                  <span className="text-muted-foreground">{t('rejections.reason')} </span>
                  {rejection.reason}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">{t('rejections.noReason')}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
