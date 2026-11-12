import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthState, useMutation } from '../../lib/api/react';
import i18n, { LANGUAGE_STORAGE_KEY } from '../../i18n';
import { LanguageSelect } from './LanguageSwitcher';
import { Footer } from './Footer';
import { MemoryRouter, useLocation } from 'react-router-dom';

vi.mock('../../lib/api/react', () => ({
  useAuthState: vi.fn(),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));
vi.mock('../../hooks/useInstanceConfig', () => ({
  useInstanceConfig: () => ({ isSingle: false, brand: 'BazarPro' }),
}));

const save = vi.fn();

function CurrentPath() {
  return <p data-testid="path">{useLocation().pathname}</p>;
}

describe('language switch', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('de');
    save.mockReset();
    vi.mocked(useMutation).mockReturnValue(save as unknown as ReturnType<typeof useMutation>);
  });

  it('switches the texts and saves the choice at the account', async () => {
    vi.mocked(useAuthState).mockReturnValue({ isAuthenticated: true, isLoading: false });
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );
    expect(screen.getByText('Impressum')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Sprache auswählen'), { target: { value: 'en' } });
    expect(await screen.findByText('Imprint')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(save).toHaveBeenCalledWith({ locale: 'en' });
    await i18n.changeLanguage('de');
  });

  it('visitors without account only change the language in the browser', () => {
    vi.mocked(useAuthState).mockReturnValue({ isAuthenticated: false, isLoading: false });
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LanguageSelect />
        <CurrentPath />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText('Sprache auswählen'), { target: { value: 'en' } });
    expect(i18n.language).toBe('en');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
    expect(screen.getByTestId('path')).toHaveTextContent('/login');
    expect(save).not.toHaveBeenCalled();
  });

  it("on a page with an address per language opens that language's address", () => {
    vi.mocked(useAuthState).mockReturnValue({ isAuthenticated: false, isLoading: false });
    render(
      <MemoryRouter initialEntries={['/features?x=1']}>
        <LanguageSelect />
        <CurrentPath />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText('Sprache auswählen'), { target: { value: 'en' } });
    expect(screen.getByTestId('path')).toHaveTextContent('/en/features');
    fireEvent.change(screen.getByLabelText('Choose language'), { target: { value: 'de' } });
    expect(screen.getByTestId('path')).toHaveTextContent(/^\/features$/);
  });

  it('the footer links to the pages in the current language', async () => {
    vi.mocked(useAuthState).mockReturnValue({ isAuthenticated: false, isLoading: false });
    await i18n.changeLanguage('en');
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );
    expect(screen.getByText('Features').closest('a')).toHaveAttribute('href', '/en/features');
    expect(screen.getByText('Imprint').closest('a')).toHaveAttribute('href', '/imprint');
  });
});
