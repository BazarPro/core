import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolvePlausible } from './analyticsConfig';
import { applyLegalDirectives } from './legalDirectives';
import { LEGAL_PAGES } from './legalPages';

const env = { plausibleDomain: 'bazarpro.de', plausibleApiHost: 'https://analytics.bazarpro.de/' };

describe('resolvePlausible', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.__BAZARPRO_CONFIG__;
  });

  it('ignores values from the build, the published image runs on every instance', () => {
    vi.stubEnv('DOMAIN_NAME', 'bazarpro.de');
    vi.stubEnv('VITE_PLAUSIBLE_API_HOST', 'https://analytics.bazarpro.de');
    window.__BAZARPRO_CONFIG__ = { siteUrl: 'https://basar.example.org' };

    expect(resolvePlausible(undefined)).toBeNull();
    // Only the domain entered: page views must not go to a server nobody chose
    expect(resolvePlausible({ enabled: true, domain: 'basar.example.org' })).toBeNull();
  });

  it('uses the values the web server injects', () => {
    window.__BAZARPRO_CONFIG__ = {
      plausibleDomain: 'basar.example.org',
      plausibleApiHost: 'https://plausible.example.org',
    };

    expect(resolvePlausible(undefined)).toEqual({
      domain: 'basar.example.org',
      apiHost: 'https://plausible.example.org',
    });
  });

  it('uses the server values when nothing is stored', () => {
    expect(resolvePlausible(undefined, env)).toEqual({
      domain: 'bazarpro.de',
      apiHost: 'https://analytics.bazarpro.de',
    });
    expect(resolvePlausible(undefined, {})).toBeNull();
  });

  it('admin settings override the server values and can switch analytics off', () => {
    expect(
      resolvePlausible({ enabled: true, domain: 'basar.example.org', apiHost: '' }, env)
    ).toEqual({ domain: 'basar.example.org', apiHost: 'https://analytics.bazarpro.de' });
    expect(resolvePlausible({ enabled: false }, env)).toBeNull();
    // Switched on without a server anywhere: still off
    expect(resolvePlausible({ enabled: true }, {})).toBeNull();
  });
});

describe('analytics section in the privacy policy', () => {
  const text = 'Vorher\n\n{{webanalyse}}\n\n## Danach';

  it('is filled in while Plausible is on and left out otherwise', () => {
    const on = applyLegalDirectives(text, {
      domain: 'basar.example.org',
      apiHost: 'https://plausible.example.org',
    });
    expect(on).toContain('## Webanalyse mit Plausible Analytics');
    expect(on).toContain('an den Server plausible.example.org übermittelt');
    expect(applyLegalDirectives(text, null)).toBe('Vorher\n\n## Danach');
  });

  it('the self-hosting template uses the block and has no numbered headings', () => {
    const template = LEGAL_PAGES.privacy.template;
    expect(template).toContain('{{webanalyse}}');
    expect(template).not.toMatch(/^## \d+\./m);
    // Only the hint for admins (a [[placeholder]]) still mentions Plausible
    const published = applyLegalDirectives(template, null).replace(/\[\[[^\]]+\]\]/g, '');
    expect(published).not.toContain('Plausible');
  });
});
