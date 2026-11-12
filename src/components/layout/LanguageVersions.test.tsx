import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import i18n, { LANGUAGE_STORAGE_KEY } from '../../i18n';
import { LanguageHint, LanguageVersionLinks } from './LanguageVersions';

function browserLanguages(languages: string[]) {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
}

function renderAt(path: string, ui: React.ReactNode) {
  return render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  await i18n.changeLanguage('de');
});

afterEach(() => {
  delete window.__BAZARPRO_CONFIG__;
  vi.restoreAllMocks();
});

describe('LanguageVersionLinks', () => {
  it('links to the page in the other language', () => {
    renderAt('/features', <LanguageVersionLinks />);
    const link = screen.getByRole('link', { name: 'English' });
    expect(link).toHaveAttribute('href', '/en/features');
    expect(link).toHaveAttribute('hreflang', 'en');
  });

  it('links back from the English page', () => {
    renderAt('/en', <LanguageVersionLinks />);
    expect(screen.getByRole('link', { name: 'Deutsch' })).toHaveAttribute('href', '/');
  });

  it('shows nothing on pages without language versions or on an association instance', () => {
    const { container } = renderAt('/imprint', <LanguageVersionLinks />);
    expect(container).toBeEmptyDOMElement();
    window.__BAZARPRO_CONFIG__ = { mode: 'single' };
    const single = renderAt('/contact', <LanguageVersionLinks />);
    expect(single.container).toBeEmptyDOMElement();
  });
});

describe('LanguageHint', () => {
  it('offers the English page to an English browser, in English', () => {
    browserLanguages(['en-US']);
    renderAt('/pricing', <LanguageHint />);
    expect(screen.getByText(/also available in English/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'View in English' }));
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
  });

  it('stays hidden for a German browser, a chosen language and crawlers', () => {
    browserLanguages(['de-DE']);
    expect(renderAt('/pricing', <LanguageHint />).container).toBeEmptyDOMElement();

    browserLanguages(['en-US']);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'de');
    expect(renderAt('/pricing', <LanguageHint />).container).toBeEmptyDOMElement();
    localStorage.clear();

    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
    );
    expect(renderAt('/pricing', <LanguageHint />).container).toBeEmptyDOMElement();
    vi.restoreAllMocks();

    // The prerendering runs in an automated browser
    browserLanguages(['de-DE']);
    Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true });
    try {
      expect(renderAt('/en/pricing', <LanguageHint />).container).toBeEmptyDOMElement();
    } finally {
      Reflect.deleteProperty(navigator, 'webdriver');
    }
  });

  it('can be closed for the session', () => {
    browserLanguages(['en-US']);
    const first = renderAt('/', <LanguageHint />);
    fireEvent.click(screen.getByRole('button', { name: 'Close notice' }));
    expect(first.container).toBeEmptyDOMElement();
    first.unmount();
    expect(renderAt('/features', <LanguageHint />).container).toBeEmptyDOMElement();
  });
});
