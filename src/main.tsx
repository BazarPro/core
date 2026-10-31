import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import './i18n';
import App from './App.tsx';
import { ApiClient } from './lib/api/client';
import { ApiProvider } from './lib/api/react';
import { initPlausible } from './lib/plausible';
import { openPersistedQueries } from './lib/api/persistedQueries';
import { isOfflineAvailable } from './lib/offlineMode';

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
