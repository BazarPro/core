import { useEffect } from 'react';
import {
  buildSeoDescription,
  DEFAULT_SEO_IMAGE,
  getDefaultDescription,
  getDefaultSiteName,
  toAbsoluteUrl,
} from '../../lib/seo';
import { currentLocale } from '../../i18n';
import { DEFAULT_LOCALE, type Locale } from '../../shared/constants';
import { localizedAlternates, localizedPath } from '../../shared/localizedRoutes';

type JsonLd = Record<string, unknown> | Record<string, unknown>[];

interface SeoProps {
  title?: string;
  description?: string;
  canonical?: string;
  image?: string;
  type?: string;
  jsonLd?: JsonLd;
  jsonLdId?: string;
  noIndex?: boolean;
  siteName?: string;
  locale?: string;
}

function upsertMeta(attr: 'name' | 'property', key: string, content?: string) {
  const selector = `meta[${attr}="${key}"]`;
  const existing = document.querySelector(selector);

  if (!content || !content.trim()) {
    if (existing) existing.remove();
    return;
  }

  const node = existing ?? document.createElement('meta');
  node.setAttribute(attr, key);
  node.setAttribute('content', content);
  node.setAttribute('data-seo', 'true');
  if (!existing) document.head.appendChild(node);
}

function upsertLink(rel: string, href?: string) {
  const selector = `link[rel="${rel}"]`;
  const existing = document.querySelector(selector);

  if (!href || !href.trim()) {
    if (existing) existing.remove();
    return;
  }

  const node = existing ?? document.createElement('link');
  node.setAttribute('rel', rel);
  node.setAttribute('href', href);
  node.setAttribute('data-seo', 'true');
  if (!existing) document.head.appendChild(node);
}

/** Open Graph names of the languages */
const OG_LOCALES: Record<Locale, string> = { de: 'de_DE', en: 'en_US' };

/**
 * hreflang links to all language versions of the page, German also as x-default.
 * Pages without versions remove them.
 */
function replaceAlternates(alternates: { hreflang: string; href: string }[]) {
  document.head
    .querySelectorAll('link[rel="alternate"][hreflang]')
    .forEach((node) => node.remove());
  for (const { hreflang, href } of alternates) {
    const node = document.createElement('link');
    node.setAttribute('rel', 'alternate');
    node.setAttribute('hreflang', hreflang);
    node.setAttribute('href', href);
    node.setAttribute('data-seo', 'true');
    document.head.appendChild(node);
  }
}

function replaceOgLocaleAlternates(locales: string[]) {
  document.head
    .querySelectorAll('meta[property="og:locale:alternate"]')
    .forEach((node) => node.remove());
  for (const locale of locales) {
    const node = document.createElement('meta');
    node.setAttribute('property', 'og:locale:alternate');
    node.setAttribute('content', locale);
    node.setAttribute('data-seo', 'true');
    document.head.appendChild(node);
  }
}

function upsertJsonLd(id: string, data?: JsonLd) {
  const existing = document.getElementById(id);
  if (!data) {
    if (existing) existing.remove();
    return;
  }

  const node = (existing ?? document.createElement('script')) as HTMLScriptElement;
  node.id = id;
  node.type = 'application/ld+json';
  node.text = JSON.stringify(data);
  node.setAttribute('data-seo', 'true');
  if (!existing) document.head.appendChild(node);
}

export function Seo({
  title,
  description,
  canonical,
  image = DEFAULT_SEO_IMAGE,
  type = 'website',
  jsonLd,
  jsonLdId = 'seo-jsonld',
  noIndex,
  siteName = getDefaultSiteName(),
  locale,
}: SeoProps) {
  const language = currentLocale();
  useEffect(() => {
    // A page with an address per language (canonical "/features") points to the
    // address of the shown language and names the others
    const versions = canonical ? localizedAlternates(canonical) : [];
    const localizedCanonical = canonical ? localizedPath(canonical, language) : canonical;
    const ogLocale = locale ?? OG_LOCALES[language];
    const resolvedTitle = title?.trim() ? title.trim() : siteName;
    const resolvedDescription = buildSeoDescription(description, getDefaultDescription());
    const canonicalUrl = toAbsoluteUrl(localizedCanonical) ?? window.location.href;
    const imageUrl = toAbsoluteUrl(image);

    document.title = resolvedTitle;

    upsertMeta('name', 'description', resolvedDescription);
    upsertMeta('name', 'robots', noIndex ? 'noindex, nofollow' : undefined);

    upsertMeta('property', 'og:title', resolvedTitle);
    upsertMeta('property', 'og:description', resolvedDescription);
    upsertMeta('property', 'og:type', type);
    upsertMeta('property', 'og:url', canonicalUrl);
    upsertMeta('property', 'og:site_name', siteName);
    upsertMeta('property', 'og:locale', ogLocale);
    replaceOgLocaleAlternates(
      versions.filter((v) => v.locale !== language).map((v) => OG_LOCALES[v.locale])
    );
    upsertMeta('property', 'og:image', imageUrl);

    upsertMeta('name', 'twitter:card', imageUrl ? 'summary_large_image' : 'summary');
    upsertMeta('name', 'twitter:title', resolvedTitle);
    upsertMeta('name', 'twitter:description', resolvedDescription);
    upsertMeta('name', 'twitter:image', imageUrl);

    upsertLink('canonical', canonicalUrl);
    replaceAlternates(
      versions.flatMap((version) => {
        const href = toAbsoluteUrl(version.path)!;
        const entry = { hreflang: version.locale, href };
        return version.locale === DEFAULT_LOCALE
          ? [entry, { hreflang: 'x-default', href }]
          : [entry];
      })
    );
    upsertJsonLd(jsonLdId, jsonLd);
  }, [
    title,
    description,
    canonical,
    image,
    type,
    jsonLd,
    jsonLdId,
    noIndex,
    siteName,
    locale,
    language,
  ]);

  return null;
}
