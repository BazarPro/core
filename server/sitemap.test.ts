import { describe, expect, it } from 'vitest';
import { buildSitemap } from './sitemap.ts';

const SITE = 'https://bazarpro.de';

/** The <url> entry of an address. */
function entry(sitemap: string, loc: string): string {
  return sitemap.split('<url>').find((block) => block.includes(`<loc>${loc}</loc>`)) ?? '';
}

describe('buildSitemap', () => {
  it('lists every language of a page, each naming all versions', () => {
    const sitemap = buildSitemap(SITE, [], []);
    for (const loc of [`${SITE}/features`, `${SITE}/en/features`]) {
      const block = entry(sitemap, loc);
      expect(block).toContain(`hreflang="de" href="${SITE}/features"`);
      expect(block).toContain(`hreflang="x-default" href="${SITE}/features"`);
      expect(block).toContain(`hreflang="en" href="${SITE}/en/features"`);
    }
    expect(entry(sitemap, `${SITE}/imprint`)).not.toContain('hreflang');
  });

  it('gives static pages no made-up lastmod, events their date', () => {
    const sitemap = buildSitemap(SITE, [{ _id: 'e1', startDate: Date.UTC(2026, 4, 2) }], []);
    expect(entry(sitemap, `${SITE}/`)).not.toContain('<lastmod>');
    expect(entry(sitemap, `${SITE}/public-events/e1`)).toContain('<lastmod>2026-05-02</lastmod>');
  });

  it('without languages only the German addresses', () => {
    const sitemap = buildSitemap(SITE, [], [], { staticRoutes: ['/contact'], localized: false });
    expect(sitemap).toContain(`<loc>${SITE}/contact</loc>`);
    expect(sitemap).not.toContain('/en');
    expect(sitemap).not.toContain('hreflang');
  });
});
