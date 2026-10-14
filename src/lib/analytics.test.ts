import { describe, expect, it } from 'vitest';
import { resolvePlausible } from './analyticsConfig';
import { applyLegalDirectives } from './legalDirectives';
import { LEGAL_PAGES } from './legalPages';

const env = { plausibleDomain: 'bazarpro.de', plausibleApiHost: 'https://analytics.bazarpro.de/' };

describe('resolvePlausible', () => {
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
