import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ApiClient } from '../lib/api/client';
import { ApiProvider } from '../lib/api/react';
import { loadSettings, saveToken } from './settings';
import { ServerSetup } from './ServerSetup';

/** Deep link of the OAuth sign-in, see backend/src/auth/oauth.rs */
const OAUTH_CALLBACK = 'bazarpro://auth';

/**
 * Start of the mobile app (Capacitor). Without a chosen server it shows the server
 * choice; otherwise it starts the normal app against that server with a bearer token.
 */
export async function startNative(root: HTMLElement) {
  const settings = await loadSettings();
  if (!settings.server) {
    createRoot(root).render(
      <StrictMode>
        <ServerSetup />
      </StrictMode>
    );
    return;
  }

  // Before the app is imported: runtimeConfig reads it once (src/lib/runtimeConfig.ts)
  window.__BAZARPRO_CONFIG__ = {
    siteUrl: settings.server,
    mode: settings.mode ?? undefined,
  };

  let token = settings.token;
  const client = new ApiClient(settings.server, {
    getToken: () => token,
    setToken: (value) => {
      token = value;
      void saveToken(value);
    },
    openExternal: (url) => Browser.open({ url }),
  });

  void CapacitorApp.addListener('appUrlOpen', ({ url }) => {
    if (!url.startsWith(OAUTH_CALLBACK)) return;
    void Browser.close().catch(() => {});
    const params = new URL(url).searchParams;
    const code = params.get('code');
    const fail = (error: string) => window.location.replace(`/login?error=${error}`);
    if (!code) return fail(params.get('error') ?? 'OAUTH_FAILED');
    client.completeAppSignIn(code).catch(() => fail('OAUTH_FAILED'));
  });

  // Android back button: back in the app, closes it on the first page
  void CapacitorApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else void CapacitorApp.exitApp();
  });

  const { default: App } = await import('../App');
  createRoot(root).render(
    <StrictMode>
      <ApiProvider client={client}>
        <App />
      </ApiProvider>
    </StrictMode>
  );
}
