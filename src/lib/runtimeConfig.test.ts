import { afterEach, describe, expect, it } from 'vitest';
import { runtimeConfig } from './runtimeConfig';
import { getProductUrl } from './utils';
import type { Id } from './api/types';

afterEach(() => {
  delete window.__BAZARPRO_CONFIG__;
});

describe('runtimeConfig', () => {
  it('follows a config set after loading, as the mobile app does once its server is chosen', () => {
    expect(runtimeConfig.mode).toBe('platform');
    window.__BAZARPRO_CONFIG__ = { siteUrl: 'https://verein.example', mode: 'single' };
    expect(runtimeConfig.mode).toBe('single');
    // QR labels point to the server, not to the app's own origin (https://localhost)
    expect(getProductUrl('p1' as Id<'products'>)).toBe('https://verein.example/products/view/p1');
  });
});
