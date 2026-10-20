import { describe, expect, it } from 'vitest';
import { docsUrl, selfHostUrl } from './links';

describe('docsUrl', () => {
  it('links German readers to the German pages', () => {
    expect(docsUrl('de')).toBe('https://docs.bazarpro.de/');
    expect(selfHostUrl('de')).toBe('https://docs.bazarpro.de/selbst-hosten/');
  });

  it('links English readers to the pages under /en/', () => {
    expect(docsUrl('en', '/ratgeber/kinderbasar-organisieren/')).toBe(
      'https://docs.bazarpro.de/en/ratgeber/kinderbasar-organisieren/'
    );
    expect(selfHostUrl('en')).toBe('https://docs.bazarpro.de/en/selbst-hosten/');
  });

  it('falls back to German without a language', () => {
    expect(docsUrl(undefined)).toBe('https://docs.bazarpro.de/');
  });
});
