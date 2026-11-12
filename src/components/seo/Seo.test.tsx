import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { Seo } from './Seo';

const head = () => document.head;
const alternates = () =>
  [...head().querySelectorAll('link[rel="alternate"][hreflang]')].map((link) => [
    link.getAttribute('hreflang'),
    link.getAttribute('href'),
  ]);

afterEach(async () => {
  await i18n.changeLanguage('de');
});

describe('Seo', () => {
  it('names all language versions of a page with an address per language', () => {
    const origin = window.location.origin;
    render(<Seo title="Funktionen" canonical="/features" />);
    expect(head().querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${origin}/features`
    );
    expect(alternates()).toEqual([
      ['de', `${origin}/features`],
      ['x-default', `${origin}/features`],
      ['en', `${origin}/en/features`],
    ]);
    expect(head().querySelector('meta[property="og:locale"]')).toHaveAttribute('content', 'de_DE');
  });

  it('in English the canonical address is the English one', async () => {
    await i18n.changeLanguage('en');
    render(<Seo title="Features" canonical="/features" />);
    expect(head().querySelector('link[rel="canonical"]')?.getAttribute('href')).toMatch(
      /\/en\/features$/
    );
    expect(head().querySelector('meta[property="og:locale"]')).toHaveAttribute('content', 'en_US');
    expect(head().querySelector('meta[property="og:locale:alternate"]')).toHaveAttribute(
      'content',
      'de_DE'
    );
  });

  it('pages without language versions have no hreflang links', () => {
    render(<Seo title="Impressum" canonical="/imprint" />);
    expect(alternates()).toEqual([]);
  });
});
