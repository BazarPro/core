import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import './i18n';
import App from './App.tsx';
import { ApiClient } from './lib/api/client';
import { ApiProvider } from './lib/api/react';
import { initPlausible } from './lib/plausible';

const client = new ApiClient();

void initPlausible(client);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApiProvider client={client}>
      <App />
    </ApiProvider>
  </StrictMode>
);
