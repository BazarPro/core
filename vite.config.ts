/// <reference types="vitest" />
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
//import basicSsl from '@vitejs/plugin-basic-ssl';

// https://vite.dev/config/
export default defineConfig({
  envPrefix: ['VITE_', 'DOMAIN_NAME'],
  plugins: [
    react(),
    tailwindcss(),
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
    // The Rust backend (backend/), reached under the app's own origin like in production
    proxy: {
      '/api': { target: process.env.BACKEND_URL ?? 'http://127.0.0.1:3000', ws: true },
    },
  },
});
