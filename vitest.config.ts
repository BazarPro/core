import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['./vitest.backend.config.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json', 'cobertura', 'html'],
      reportOnFailure: true,
      exclude: ['convex/seed.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
