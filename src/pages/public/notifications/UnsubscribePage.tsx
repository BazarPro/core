import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from 'convex/react';
import { BellOff, CheckCircle2 } from 'lucide-react';
import { api } from '../../../../convex/_generated/api';
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from '../../../../convex/constants';
import { Button } from '../../../components/ui/button';
import { getUserFacingErrorMessage } from '../../../lib/errors';

/**
 * Target of the "Abbestellen" link in emails. Works without login (walk-in sellers
 * have none) and needs a click, so link scanners of mail providers do not unsubscribe.
 */
export function UnsubscribePage() {
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

  return (
    <main className="container mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-4 py-20">
      <div className="space-y-4 rounded-xl border bg-card p-8 text-center">
        {invalid ? (
          <p>Dieser Abmeldelink ist ungültig oder abgelaufen.</p>
        ) : info === undefined ? (
          <span className="loading loading-spinner loading-lg text-primary" />
        ) : done || !info.subscribed ? (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
            <h1 className="text-xl font-semibold">Abbestellt</h1>
            <p className="text-muted-foreground">
              Du bekommst keine Mails mehr zu „{info.category}“. In deinem Konto unter
              Benachrichtigungen kannst du sie jederzeit wieder einschalten.
            </p>
          </>
        ) : (
          <>
            <BellOff className="mx-auto h-10 w-10 text-muted-foreground" />
            <h1 className="text-xl font-semibold">Mails zu „{info.category}“ abbestellen?</h1>
            <p className="text-muted-foreground">
              Wichtige Mails wie Kaufbelege oder Hinweise zu deinem Konto bekommst du weiterhin.
            </p>
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
              Abbestellen
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </>
        )}
        <p className="text-sm">
          <Link to="/account" className="text-primary underline">
            Alle Benachrichtigungen im Konto verwalten
          </Link>
        </p>
      </div>
    </main>
  );
}
