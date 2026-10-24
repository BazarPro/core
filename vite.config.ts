/// <reference types="vitest" />
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
//import basicSsl from '@vitejs/plugin-basic-ssl';

/** `--mode app` builds the mobile app (Capacitor): same page, native entry point. */
const nativeApp = (): Plugin => {
  let isApp = false;
  return {
    name: 'bazarpro-native-app',
    config: (_, { mode }) => (mode === 'app' ? { build: { outDir: 'dist-app' } } : undefined),
    configResolved: (config) => void (isApp = config.mode === 'app'),
    // pre: before Vite bundles the script tags of the page
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => (isApp ? html.replace('/src/main.tsx', '/src/native/main.tsx') : html),
    },
  };
};

// https://vite.dev/config/
export default defineConfig({
  envPrefix: ['VITE_', 'DOMAIN_NAME'],
  plugins: [
    react(),
    tailwindcss(),
    nativeApp(),
    // basicSsl() generates a self-signed certificate which allows HTTPS locally.
    // This is required for camera access on mobile devices (Secure Context).
    //basicSsl(),
  ],
  server: {
    port: 5173,
    open: true,
    host: true,
    // Build output of the backend is huge and no source of the app
    watch: { ignored: ['**/backend/target/**', '**/.uv-cache/**', '**/test-results/**'] },
    // The Rust backend (backend/), reached under the app's own origin like in production.
    // Also used by `vite preview` when prerendering; BACKEND_URL may be a public site.
    proxy: {
      '/api': {
        target: process.env.BACKEND_URL ?? 'http://127.0.0.1:3000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
