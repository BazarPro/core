import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ApiClient } from '../lib/api/client';
import { ApiProvider } from '../lib/api/react';
import { openPersistedQueries } from '../lib/api/persistedQueries';
import {
  appServer,
  DEFAULT_SERVER,
  loadSettings,
  saveToken,
  SERVER_CHOICE_PATH,
  WELCOME_PATH,
  type AppSettings,
} from './settings';
import { ServerSetup } from './ServerSetup';
import { serverFitsApp } from './serverCheck';
import { AppErrorBoundary, StartProblem } from './StartProblem';
import { Welcome } from './Welcome';

/** Deep link of the OAuth sign-in, see backend/src/auth/oauth.rs */
const OAUTH_CALLBACK = 'bazarpro://auth';

/**
 * Start of the mobile app (Capacitor): the normal app against bazarpro.de or the
 * chosen server, with a bearer token. "Server wechseln" opens the server choice. When
 * the start fails, or the server is gone or too old for the app, a page says so and
 * leads to the server choice instead of a white screen.
 */
export async function startNative(root: HTMLElement) {
  const app = createRoot(root);
  let server = DEFAULT_SERVER;
  try {
    const settings = await loadSettings();
    server = appServer(settings).server;
    await startApp(app, settings);
  } catch (error) {
    console.error('App did not start:', error);
    app.render(<StartProblem server={server} reason="failed" />);
    return;
  }
  // In the background: offline the app works on, with what is on the device
  if (window.location.pathname !== SERVER_CHOICE_PATH && !(await serverFitsApp(server))) {
    app.render(<StartProblem server={server} reason="outdated" />);
  }
}

async function startApp(root: Root, settings: AppSettings) {
  const { server, mode } = appServer(settings);
  if (window.location.pathname === SERVER_CHOICE_PATH) {
    root.render(
      <StrictMode>
        <ServerSetup initial={server} onCancel={() => window.location.replace('/')} />
      </StrictMode>
    );
    return;
  }

  // Signed out, the app starts with the welcome instead of the landing page
  if (!settings.token && window.location.pathname === '/') {
    window.history.replaceState(null, '', WELCOME_PATH);
  }
  if (window.location.pathname === WELCOME_PATH) {
    root.render(
      <StrictMode>
        <Welcome server={server} />
      </StrictMode>
    );
    return;
  }

  // Site URL and mode of the server for runtimeConfig (src/lib/runtimeConfig.ts)
  window.__BAZARPRO_CONFIG__ = { siteUrl: server, mode: mode ?? undefined };

  let token = settings.token;
  const client = new ApiClient(server, {
    getToken: () => token,
    setToken: (value) => {
      token = value;
      void saveToken(value);
    },
    openExternal: (url) => Browser.open({ url }),
  });
  // Pages show the last state at once and without internet
  client.setPersistence(await openPersistedQueries());

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
  root.render(
    <StrictMode>
      <AppErrorBoundary server={server}>
        <ApiProvider client={client}>
          <App />
        </ApiProvider>
      </AppErrorBoundary>
    </StrictMode>
  );
}
