import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectLocale, LANGUAGE_STORAGE_KEY } from '.';

function browserLanguages(languages: string[]) {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('detectLocale', () => {
  it('pages with an address per language follow the address, not the browser', () => {
    // Search engines render with an English browser
    browserLanguages(['en-US']);
    expect(detectLocale('/', false)).toBe('de');
    expect(detectLocale('/features', false)).toBe('de');
    expect(detectLocale('/en/features', false)).toBe('en');
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    expect(detectLocale('/pricing', false)).toBe('de');
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'de');
    expect(detectLocale('/en', false)).toBe('en');
  });

  it('signed in, the start page is the overview in the own language', () => {
    browserLanguages(['de-DE']);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    expect(detectLocale('/', true)).toBe('en');
    expect(detectLocale('/', false)).toBe('de');
  });

  it('event and product pages are German unless the visitor chose a language', () => {
    browserLanguages(['en-US']);
    expect(detectLocale('/public-events/e1', false)).toBe('de');
    expect(detectLocale('/products/view/p1', false)).toBe('de');
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    expect(detectLocale('/public-events/e1', false)).toBe('en');
  });

  it('other pages: the chosen language, else the browser language, else German', () => {
    browserLanguages(['fr-FR', 'en-GB']);
    expect(detectLocale('/login', false)).toBe('en');
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'de');
    expect(detectLocale('/login', false)).toBe('de');
    localStorage.clear();
    browserLanguages(['fr-FR']);
    expect(detectLocale('/my-products', true)).toBe('de');
  });
});
