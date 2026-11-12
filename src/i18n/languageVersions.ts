import { runtimeConfig } from '../lib/runtimeConfig';
import type { Locale } from '../shared/constants';
import { localizedAlternates } from '../shared/localizedRoutes';

/**
 * The language versions of a page that search engines and visitors should know about
 * (hreflang, links to the other language). None on a single-association instance: its
 * pages show the association's German content, an English address adds nothing to find.
 */
export function languageVersions(path: string): { locale: Locale; path: string }[] {
  return runtimeConfig.mode === 'single' ? [] : localizedAlternates(path);
}
