import { stripMarkdownToText } from '../src/lib/markdown.ts';

/**
 * Server-side counterpart of src/components/seo/Seo.tsx: builds the same head
 * tags for public event and product pages so crawlers and link previews get
 * them without running JavaScript.
 */

export interface PageMeta {
  title: string;
  description?: string;
  canonical?: string;
  image?: string;
  type?: string;
  jsonLd?: Record<string, unknown>;
  /** Same id as the client Seo component uses, so it updates instead of duplicating */
  jsonLdId?: string;
  noIndex?: boolean;
}

export interface PublicEvent {
  _id: string;
  title: string;
  description?: string;
  location: string;
  startDate: number;
  endDate: number;
  coverImageUrl?: string | null;
}

export interface PublicProduct {
  _id: string;
  title: string;
  description?: string;
  price: number;
  sold?: boolean;
  readyForSale?: boolean;
  archivedAt?: number;
}

const SITE_NAME = 'BazarPro';
const DEFAULT_DESCRIPTION =
  'BazarPro hilft Veranstaltern und Verkaeufern, lokale Events und Angebote sichtbar zu machen.';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(value: string, maxLength = 160): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trim()}...`;
}

export function buildDescription(value: string | undefined, fallback: string): string {
  const text = value ? stripMarkdownToText(value) : '';
  return truncate(text || fallback);
}

function formatDateRange(startDate: number, endDate: number): string {
  const options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeZone: 'Europe/Berlin' };
  const start = new Date(startDate).toLocaleDateString('de-DE', options);
  const end = new Date(endDate).toLocaleDateString('de-DE', options);
  return start === end ? start : `${start} - ${end}`;
}

export function eventMeta(
  event: PublicEvent,
  siteUrl: string,
  page: 'event' | 'eventProducts'
): PageMeta {
  const description = buildDescription(
    event.description,
    `Event in ${event.location} am ${formatDateRange(event.startDate, event.endDate)}.`
  );
  const eventUrl = `${siteUrl}/public-events/${event._id}`;
  const canonical = page === 'event' ? eventUrl : `${eventUrl}/products`;
  const image = event.coverImageUrl ?? undefined;

  return {
    title:
      page === 'event'
        ? `${event.title} in ${event.location} | ${SITE_NAME}`
        : `Angebote bei ${event.title} in ${event.location} | ${SITE_NAME}`,
    description,
    canonical,
    image,
    jsonLdId: page === 'event' ? `event-jsonld-${event._id}` : `event-products-jsonld-${event._id}`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: event.title,
      description,
      startDate: new Date(event.startDate).toISOString(),
      endDate: new Date(event.endDate).toISOString(),
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: { '@type': 'Place', name: event.location, address: event.location },
      url: eventUrl,
      ...(image ? { image: [image] } : {}),
    },
  };
}

export function productMeta(
  product: PublicProduct,
  imageUrl: string | undefined,
  siteUrl: string
): PageMeta {
  const description = buildDescription(product.description, `${product.title} bei ${SITE_NAME}.`);
  const canonical = `${siteUrl}/products/view/${product._id}`;
  const available = !product.sold && product.readyForSale !== false && !product.archivedAt;

  return {
    title: `${product.title} | ${SITE_NAME}`,
    description,
    canonical,
    image: imageUrl,
    type: 'product',
    // Sold or archived products should drop out of search results
    noIndex: !available,
    jsonLdId: `product-jsonld-${product._id}`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.title,
      description,
      url: canonical,
      ...(imageUrl ? { image: [imageUrl] } : {}),
      offers: {
        '@type': 'Offer',
        price: product.price.toFixed(2),
        priceCurrency: 'EUR',
        availability: available ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
        url: canonical,
      },
    },
  };
}

export function notFoundMeta(): PageMeta {
  return { title: `Seite nicht gefunden | ${SITE_NAME}`, noIndex: true };
}

function metaTag(attr: 'name' | 'property', key: string, content: string | undefined): string {
  if (!content) return '';
  return `<meta ${attr}="${key}" content="${escapeHtml(content)}" data-seo="true" />`;
}

/** Head tags matching what the Seo component writes on the client. */
export function buildHeadTags(meta: PageMeta): string {
  const description = meta.description ?? DEFAULT_DESCRIPTION;
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    metaTag('name', 'description', description),
    metaTag('name', 'robots', meta.noIndex ? 'noindex, nofollow' : undefined),
    metaTag('property', 'og:title', meta.title),
    metaTag('property', 'og:description', description),
    metaTag('property', 'og:type', meta.type ?? 'website'),
    metaTag('property', 'og:url', meta.canonical),
    metaTag('property', 'og:site_name', SITE_NAME),
    metaTag('property', 'og:locale', 'de_DE'),
    metaTag('property', 'og:image', meta.image),
    metaTag('name', 'twitter:card', meta.image ? 'summary_large_image' : 'summary'),
    metaTag('name', 'twitter:title', meta.title),
    metaTag('name', 'twitter:description', description),
    metaTag('name', 'twitter:image', meta.image),
    meta.canonical
      ? `<link rel="canonical" href="${escapeHtml(meta.canonical)}" data-seo="true" />`
      : '',
    meta.jsonLd
      ? // '<' is escaped so user content cannot close the script tag
        `<script type="application/ld+json" id="${escapeHtml(meta.jsonLdId ?? 'seo-jsonld')}" data-seo="true">${JSON.stringify(
          meta.jsonLd
        ).replace(/</g, '\\u003c')}</script>`
      : '',
  ];
  return tags.filter(Boolean).join('\n    ');
}

/** Replaces the shell's title and description with the page-specific head tags. */
export function injectHead(shellHtml: string, meta: PageMeta): string {
  const withoutDefaults = shellHtml
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+name="description"[\s\S]*?\/?>/i, '');
  return withoutDefaults.replace('</head>', `    ${buildHeadTags(meta)}\n  </head>`);
}
