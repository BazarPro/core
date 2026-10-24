import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '../../../lib/api/react';
import { BellOff, CheckCircle2 } from 'lucide-react';
import { api } from '../../../lib/api/functions';
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from '../../../shared/constants';
import { Button } from '../../../components/ui/button';
import { getUserFacingErrorMessage } from '../../../lib/errors';
import { useTranslation } from 'react-i18next';
import { Loading } from '../../../components/ui/loading';
import { Skeleton } from '../../../components/ui/skeleton';

/**
 * Target of the "Abbestellen" link in emails. Works without login (walk-in sellers
 * have none) and needs a click, so link scanners of mail providers do not unsubscribe.
 */
export function UnsubscribePage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';
  const raw = params.get('k') ?? '';
  const category = (NOTIFICATION_CATEGORIES as readonly string[]).includes(raw)
    ? (raw as NotificationCategory)
    : null;
  const info = useQuery(
    api.notifications.getUnsubscribeInfo,
    category && token ? { token, category } : 'skip'
  );
  const unsubscribe = useMutation(api.notifications.unsubscribe);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalid = !category || !token || info === null;
  // The category name in the visitor's language, not the server's
  const categoryTitle = category
    ? t(`notifications.categories.${category}.title`, { ns: 'account' })
    : '';

  return (
    <main className="container mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-4 py-20">
      <div className="space-y-4 rounded-xl border bg-card p-8 text-center">
        {invalid ? (
          <p>{t('unsubscribe.invalid')}</p>
        ) : info === undefined ? (
          <Loading className="space-y-4">
            <Skeleton className="mx-auto h-10 w-10 rounded-full" />
            <Skeleton className="mx-auto h-6 w-2/3" />
            <Skeleton className="mx-auto h-10 w-40" />
          </Loading>
        ) : done || !info.subscribed ? (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
            <h1 className="text-xl font-semibold">{t('unsubscribe.done')}</h1>
            <p className="text-muted-foreground">
              {t('unsubscribe.doneText', { category: categoryTitle })}
              {info.canLogIn && ` ${t('unsubscribe.doneTextAccount')}`}
            </p>
          </>
        ) : (
          <>
            <BellOff className="mx-auto h-10 w-10 text-muted-foreground" />
            <h1 className="text-xl font-semibold">
              {t('unsubscribe.question', { category: categoryTitle })}
            </h1>
            <p className="text-muted-foreground">{t('unsubscribe.keep')}</p>
            <Button
              onClick={async () => {
                try {
                  await unsubscribe({ token, category: category! });
                  setDone(true);
                } catch (e) {
                  setError(getUserFacingErrorMessage(e));
                }
              }}
            >
              {t('unsubscribe.confirm')}
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </>
        )}
        {info?.canLogIn && (
          <p className="text-sm">
            <Link to="/account#notifications" className="text-primary underline">
              {t('unsubscribe.manage')}
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
