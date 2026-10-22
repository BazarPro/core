import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ApiClient } from '../lib/api/client';
import { ApiProvider } from '../lib/api/react';
import { appServer, loadSettings, saveToken, SERVER_CHOICE_PATH } from './settings';
import { ServerSetup } from './ServerSetup';

/** Deep link of the OAuth sign-in, see backend/src/auth/oauth.rs */
const OAUTH_CALLBACK = 'bazarpro://auth';

/**
 * Start of the mobile app (Capacitor): the normal app against bazarpro.de or the
 * chosen server, with a bearer token. "Server wechseln" opens the server choice.
 */
export async function startNative(root: HTMLElement) {
  const settings = await loadSettings();
  const { server, mode } = appServer(settings);
  if (window.location.pathname === SERVER_CHOICE_PATH) {
    createRoot(root).render(
      <StrictMode>
        <ServerSetup initial={server} onCancel={() => window.location.replace('/')} />
      </StrictMode>
    );
    return;
  }

  // Site URL and mode of the server for runtimeConfig (src/lib/runtimeConfig.ts)
  window.__BAZARPRO_CONFIG__ = { siteUrl: server, mode: mode ?? undefined };

  // Signed out, the app starts at the sign-in instead of the landing page
  if (!settings.token && window.location.pathname === '/') {
    window.history.replaceState(null, '', '/login');
  }

  let token = settings.token;
  const client = new ApiClient(server, {
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
