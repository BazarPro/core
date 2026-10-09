import { describe, expect, it } from 'vitest';
import { configScript, injectRuntime, rewriteSiteUrl } from './runtime.ts';

const options = {
  clientConfig: { convexUrl: 'https://convex.example.org' },
  buildSiteUrl: 'https://bazarpro.de',
  siteUrl: 'https://basar.example.org',
};

describe('configScript', () => {
  it('omits empty values and escapes "<"', () => {
    expect(configScript({ convexUrl: 'https://c</script>', siteUrl: '' })).toBe(
      '<script id="bazarpro-config">window.__BAZARPRO_CONFIG__={"convexUrl":"https://c\\u003c/script>"}</script>'
    );
  });
});

describe('injectRuntime', () => {
  it('adds the script at the start of <head> and rewrites the site URL', () => {
    const html =
      '<html><head lang="de"><link rel="canonical" href="https://bazarpro.de/features"></head></html>';
    expect(injectRuntime(html, options)).toBe(
      '<html><head lang="de"><script id="bazarpro-config">window.__BAZARPRO_CONFIG__={"convexUrl":"https://convex.example.org"}</script><link rel="canonical" href="https://basar.example.org/features"></head></html>'
    );
  });

  it('replaces an existing config script instead of adding a second one', () => {
    const once = injectRuntime('<head></head>', options);
    expect(injectRuntime(once, options)).toBe(once);
  });
});

describe('rewriteSiteUrl', () => {
  it('keeps the text when no build URL is known or it matches', () => {
    expect(rewriteSiteUrl('https://bazarpro.de', { ...options, buildSiteUrl: undefined })).toBe(
      'https://bazarpro.de'
    );
    expect(
      rewriteSiteUrl('https://bazarpro.de', { ...options, siteUrl: 'https://bazarpro.de' })
    ).toBe('https://bazarpro.de');
  });
});
