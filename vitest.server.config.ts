import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'server',
    include: ['server/**/*.test.ts'],
    environment: 'node',
  },
});
