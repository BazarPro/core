import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(viteConfig, defineConfig({
  test: {
    name: 'backend',
    include: ['convex/**/*.{test,spec}.{ts,tsx}'],
    environment: 'edge-runtime',
    globals: true,
    server: { deps: { inline: ['convex-test'] } },
  },
}));
