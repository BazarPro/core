import { describe, expect, it } from 'vitest';
import {
  isGermanContentPath,
  localeOfPath,
  localizedAlternates,
  localizedPath,
  splitLocalePrefix,
} from './localizedRoutes';
import { isAppRoute } from './appRoutes';

describe('localized routes', () => {
  it('splits the language prefix off', () => {
    expect(splitLocalePrefix('/en')).toEqual({ locale: 'en', path: '/' });
    expect(splitLocalePrefix('/en/')).toEqual({ locale: 'en', path: '/' });
    expect(splitLocalePrefix('/en/features')).toEqual({ locale: 'en', path: '/features' });
    expect(splitLocalePrefix('/features/')).toEqual({ locale: null, path: '/features' });
    // Only a whole segment is a prefix
    expect(splitLocalePrefix('/entries')).toEqual({ locale: null, path: '/entries' });
  });

  it('builds the address of a page in a language', () => {
    expect(localizedPath('/', 'en')).toBe('/en');
    expect(localizedPath('/features', 'en')).toBe('/en/features');
    expect(localizedPath('/en/features', 'de')).toBe('/features');
    expect(localizedPath('/', 'de')).toBe('/');
    // Pages without an English address stay as they are
    expect(localizedPath('/imprint', 'en')).toBe('/imprint');
    expect(localizedPath('/public-events/1', 'en')).toBe('/public-events/1');
  });

  it('lists all language versions of a page', () => {
    expect(localizedAlternates('/en/pricing')).toEqual([
      { locale: 'de', path: '/pricing' },
      { locale: 'en', path: '/en/pricing' },
    ]);
    expect(localizedAlternates('/imprint')).toEqual([]);
  });

  it('takes the language from the address of localized pages only', () => {
    expect(localeOfPath('/')).toBe('de');
    expect(localeOfPath('/contact')).toBe('de');
    expect(localeOfPath('/en/contact')).toBe('en');
    expect(localeOfPath('/login')).toBeNull();
    expect(localeOfPath('/public-events/1')).toBeNull();
  });

  it('knows the public pages with German content', () => {
    expect(isGermanContentPath('/public-events/1')).toBe(true);
    expect(isGermanContentPath('/public-events/1/products/')).toBe(true);
    expect(isGermanContentPath('/products/view/p1')).toBe(true);
    expect(isGermanContentPath('/imprint')).toBe(true);
    expect(isGermanContentPath('/events/view/1')).toBe(false);
  });

  it('the English pages are app routes, other /en paths are not', () => {
    expect(isAppRoute('/en')).toBe(true);
    expect(isAppRoute('/en/features/')).toBe(true);
    expect(isAppRoute('/en/login')).toBe(false);
    expect(isAppRoute('/en/public-events/1')).toBe(false);
  });
});
