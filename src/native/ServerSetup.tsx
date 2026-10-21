import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClient } from '../lib/api/client';
import { api } from '../lib/api/functions';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { DEFAULT_SERVER, normalizeServer, saveServer } from './settings';

/** backend/src/modules/instance.rs APP_API: bearer token, CORS, OAuth via deep link */
const MIN_APP_API = 1;

/**
 * First screen of the mobile app: which BazarPro to use. The address is checked by
 * loading the instance config, which also tells the mode (platform or association).
 */
export function ServerSetup({ initial }: { initial?: string | null }) {
  const { t } = useTranslation('common');
  const [address, setAddress] = useState(initial ?? DEFAULT_SERVER);
  const [error, setError] = useState<'unreachable' | 'outdated' | null>(null);
  const [checking, setChecking] = useState(false);

  const connect = async (event: FormEvent) => {
    event.preventDefault();
    const server = normalizeServer(address);
    setError(null);
    if (!server) return setError('unreachable');
    setChecking(true);
    try {
      const config = await new ApiClient(server).query(api.instance.getConfig, {});
      if ((config.appApi ?? 0) < MIN_APP_API) {
        setError('outdated');
        setChecking(false);
        return;
      }
      await saveServer(server, config.mode);
      window.location.replace('/');
    } catch {
      setError('unreachable');
      setChecking(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 pt-[env(safe-area-inset-top)]">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('app.server.title')}</CardTitle>
          <CardDescription>{t('app.server.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={connect} className="space-y-4">
            <Input
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              aria-label={t('app.server.address')}
              aria-invalid={error !== null}
            />
            {error && <p className="text-sm text-destructive">{t(`app.server.${error}`)}</p>}
            <Button type="submit" className="w-full" disabled={checking}>
              {checking ? t('app.server.checking') : t('app.server.connect')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
