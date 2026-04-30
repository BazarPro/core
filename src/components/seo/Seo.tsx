import { useEffect } from 'react';
import { buildSeoDescription, getDefaultDescription, getDefaultSiteName, toAbsoluteUrl } from '../../lib/seo';

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
  image,
  type = 'website',
  jsonLd,
  jsonLdId = 'seo-jsonld',
  noIndex,
  siteName = getDefaultSiteName(),
  locale = 'de_DE',
}: SeoProps) {
  useEffect(() => {
    const resolvedTitle = title?.trim() ? title.trim() : siteName;
    const resolvedDescription = buildSeoDescription(description, getDefaultDescription());
    const canonicalUrl = toAbsoluteUrl(canonical) ?? window.location.href;
    const imageUrl = toAbsoluteUrl(image);

    document.title = resolvedTitle;

    upsertMeta('name', 'description', resolvedDescription);
    upsertMeta('name', 'robots', noIndex ? 'noindex, nofollow' : undefined);

    upsertMeta('property', 'og:title', resolvedTitle);
    upsertMeta('property', 'og:description', resolvedDescription);
    upsertMeta('property', 'og:type', type);
    upsertMeta('property', 'og:url', canonicalUrl);
    upsertMeta('property', 'og:site_name', siteName);
    upsertMeta('property', 'og:locale', locale);
    upsertMeta('property', 'og:image', imageUrl);

    upsertMeta('name', 'twitter:card', imageUrl ? 'summary_large_image' : 'summary');
    upsertMeta('name', 'twitter:title', resolvedTitle);
    upsertMeta('name', 'twitter:description', resolvedDescription);
    upsertMeta('name', 'twitter:image', imageUrl);

    upsertLink('canonical', canonicalUrl);
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
  ]);

  return null;
}
