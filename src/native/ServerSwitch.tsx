import { Capacitor } from '@capacitor/core';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { runtimeConfig } from '../lib/runtimeConfig';
import { switchServer } from './settings';

/** Only in the mobile app: shows the server and leads back to the server choice. */
export function ServerSwitch() {
  const { t } = useTranslation('common');
  if (!Capacitor.isNativePlatform()) return null;
  const host = runtimeConfig.siteUrl ? new URL(runtimeConfig.siteUrl).host : '';
  return (
    <div className="my-6 flex items-center justify-between gap-4 text-sm text-muted-foreground">
      <span>{t('app.server.current', { server: host })}</span>
      <Button variant="outline" size="sm" onClick={() => void switchServer()}>
        {t('app.server.switch')}
      </Button>
    </div>
  );
}
