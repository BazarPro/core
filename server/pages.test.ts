import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackendUnavailableError, type BackendQueryClient } from './backend.ts';
import { clearSiteNameCache, resolvePage, resolveSiteName, resolveSitemap } from './pages.ts';

const down: BackendQueryClient = {
  query: async () => {
    throw new BackendUnavailableError('down');
  },
};
const broken: BackendQueryClient = {
  query: async () => {
    throw new Error('bug');
  },
};

afterEach(() => {
  clearSiteNameCache();
  vi.restoreAllMocks();
});

describe('pages without a backend answer', () => {
  it('serve the plain shell and the static sitemap, and pass on real bugs', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await resolvePage('/public-events/e1', down, 'https://x.de')).toBeNull();
    expect(await resolveSitemap(down, 'https://x.de')).toBeNull();
    await expect(resolvePage('/products/view/p1', broken, 'https://x.de')).rejects.toThrow('bug');
    await expect(resolveSitemap(broken, 'https://x.de')).rejects.toThrow('bug');
    expect(await resolvePage('/somewhere', down, 'https://x.de')).toBeNull();
  });

  it('products without photos and empty lists', async () => {
    const backend: BackendQueryClient = {
      query: async <T>(name: string) =>
        (name === 'products.getProduct'
          ? { _id: 'p1', title: 'Rad', description: 'gut', price: 10 }
          : null) as T,
    };
    const page = await resolvePage('/products/view/p1', backend, 'https://x.de');
    expect(page?.status).toBe(200);
    expect(await resolveSitemap(backend, 'https://x.de', 'single')).toContain('<urlset');
  });
});

describe('site name', () => {
  it('is the association name in single mode, cached, and kept while the backend is down', async () => {
    let calls = 0;
    const backend: BackendQueryClient = {
      query: async <T>() => {
        calls += 1;
        return { brand: 'Kinderbasar' } as T;
      },
    };
    expect(await resolveSiteName(backend, 'platform')).toBeUndefined();
    expect(await resolveSiteName(backend, 'single', 0)).toBe('Kinderbasar');
    expect(await resolveSiteName(backend, 'single', 1000)).toBe('Kinderbasar');
    expect(calls).toBe(1);
    expect(await resolveSiteName(down, 'single', 120_000)).toBe('Kinderbasar');
    clearSiteNameCache();
    expect(await resolveSiteName(down, 'single', 0)).toBeUndefined();
    const empty: BackendQueryClient = { query: async () => null };
    expect(await resolveSiteName(empty, 'single', 0)).toBeUndefined();
    await expect(resolveSiteName(broken, 'single', 0)).rejects.toThrow('bug');
  });
});
