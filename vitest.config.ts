import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['./vitest.frontend.config.ts', './vitest.server.config.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json', 'cobertura', 'html'],
      reportOnFailure: true,
      // The backend logic moved to Rust (backend/, tested with cargo test); these
      // cover the app and the web server only
      thresholds: {
        lines: 80,
        functions: 72,
        branches: 74,
        statements: 80,
      },
    },
  },
});
