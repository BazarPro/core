import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// The font of the app, self-hosted: the same on every device and in the screenshots
// (system-ui differs per platform). Only the subsets a page needs are downloaded.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/inter/900.css';
import '@fontsource/bricolage-grotesque/600.css';
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/bricolage-grotesque/800.css';
import './styles/index.css';
import './i18n';
import App from './App.tsx';
import { ApiClient } from './lib/api/client';
import { ApiProvider } from './lib/api/react';
import { initPlausible } from './lib/plausible';
import { openPersistedQueries } from './lib/api/persistedQueries';
import { isOfflineAvailable } from './lib/offlineMode';

import { applyColorTheme, rememberedColorTheme } from './lib/colorTheme';

// The colour scheme of the last visit right away, before the config loads: no blue flash
applyColorTheme(rememberedColorTheme());

const client = new ApiClient();

void initPlausible(client);

async function start() {
  // Only with the test flag in the browser; the app keeps its answers always (native/start.tsx)
  if (isOfflineAvailable()) client.setPersistence(await openPersistedQueries());
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ApiProvider client={client}>
        <App />
      </ApiProvider>
    </StrictMode>
  );
}

void start();
