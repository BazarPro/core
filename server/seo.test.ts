import { describe, expect, it } from 'vitest';
import { buildDescription, escapeHtml, eventMeta, injectHead, productMeta } from './seo.ts';

const SHELL = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="description"
      content="Default description"
    />
    <title>BazarPro</title>
  </head>
  <body><div id="root"></div></body>
</html>`;

const event = {
  _id: 'evt1',
  title: 'Fahrradbasar',
  description: '**Großer** Basar für [Räder](https://example.com)',
  location: 'Ulm',
  startDate: Date.UTC(2026, 10, 7, 9),
  endDate: Date.UTC(2026, 10, 7, 15),
  coverImageUrl: 'https://convex.example/cover.jpg',
};

describe('escapeHtml', () => {
  it('escapes markup characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;'
    );
  });
});

describe('buildDescription', () => {
  it('strips markdown and falls back for empty input', () => {
    expect(buildDescription('**Hallo** _Welt_', 'fallback')).toBe('Hallo Welt');
    expect(buildDescription('', 'fallback')).toBe('fallback');
    expect(buildDescription(undefined, 'fallback')).toBe('fallback');
  });

  it('truncates long text to 160 characters', () => {
    const result = buildDescription('a'.repeat(300), 'fallback');
    expect(result).toHaveLength(160);
    expect(result.endsWith('...')).toBe(true);
  });
});

describe('eventMeta', () => {
  it('builds event page metadata with JSON-LD', () => {
    const meta = eventMeta(event, 'https://bazarpro.de', 'event');
    expect(meta.title).toBe('Fahrradbasar in Ulm | BazarPro');
    expect(meta.description).toBe('Großer Basar für Räder');
    expect(meta.canonical).toBe('https://bazarpro.de/public-events/evt1');
    expect(meta.image).toBe('https://convex.example/cover.jpg');
    expect(meta.jsonLdId).toBe('event-jsonld-evt1');
    expect(meta.jsonLd).toMatchObject({ '@type': 'Event', name: 'Fahrradbasar' });
  });

  it('builds the products sub page with its own canonical', () => {
    const meta = eventMeta(
      { ...event, coverImageUrl: null },
      'https://bazarpro.de',
      'eventProducts'
    );
    expect(meta.title).toBe('Angebote bei Fahrradbasar in Ulm | BazarPro');
    expect(meta.canonical).toBe('https://bazarpro.de/public-events/evt1/products');
    expect(meta.image).toBeUndefined();
  });

  it('describes the date when the event has no description', () => {
    const meta = eventMeta({ ...event, description: '' }, 'https://bazarpro.de', 'event');
    expect(meta.description).toMatch(/^Event in Ulm am /);
  });
});

describe('productMeta', () => {
  const product = { _id: 'p1', title: 'Rennrad', description: 'Top', price: 120 };

  it('builds an indexable product page with an offer', () => {
    const meta = productMeta(product, 'https://img/p1.jpg', 'https://bazarpro.de');
    expect(meta.title).toBe('Rennrad | BazarPro');
    expect(meta.noIndex).toBe(false);
    expect(meta.jsonLd).toMatchObject({
      offers: { price: '120.00', priceCurrency: 'EUR', availability: 'https://schema.org/InStock' },
    });
  });

  it('marks sold or archived products as noindex', () => {
    expect(productMeta({ ...product, sold: true }, undefined, 'https://x').noIndex).toBe(true);
    expect(productMeta({ ...product, archivedAt: 1 }, undefined, 'https://x').noIndex).toBe(true);
    expect(productMeta({ ...product, readyForSale: false }, undefined, 'https://x').noIndex).toBe(
      true
    );
  });
});

describe('injectHead', () => {
  it('replaces default title and description with page tags', () => {
    const html = injectHead(SHELL, eventMeta(event, 'https://bazarpro.de', 'event'));
    expect(html).not.toContain('<title>BazarPro</title>');
    expect(html).not.toContain('Default description');
    expect(html).toContain('<title>Fahrradbasar in Ulm | BazarPro</title>');
    expect(html).toContain('<meta property="og:image" content="https://convex.example/cover.jpg"');
    expect(html).toContain(
      '<link rel="canonical" href="https://bazarpro.de/public-events/evt1" data-seo="true" />'
    );
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/name="description"/g)).toHaveLength(1);
  });

  it('escapes user content in attributes and JSON-LD', () => {
    const html = injectHead(
      SHELL,
      eventMeta(
        { ...event, title: '"><script>alert(1)</script>', description: '</script><b>x</b>' },
        'https://bazarpro.de',
        'event'
      )
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toMatch(/<\/script><b>/);
    expect(html).toContain('\\u003c/script>');
  });

  it('adds robots noindex when requested', () => {
    const html = injectHead(SHELL, { title: 'Nicht gefunden', noIndex: true });
    expect(html).toContain('<meta name="robots" content="noindex, nofollow"');
  });
});
