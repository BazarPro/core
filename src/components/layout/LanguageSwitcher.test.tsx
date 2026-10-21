import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConvexAuth, useMutation } from 'convex/react';
import i18n from '../../i18n';
import { LanguageSelect } from './LanguageSwitcher';
import { Footer } from './Footer';
import { MemoryRouter } from 'react-router-dom';

vi.mock('convex/react', () => ({
  useConvexAuth: vi.fn(),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));
vi.mock('../../hooks/useInstanceConfig', () => ({
  useInstanceConfig: () => ({ isSingle: false, brand: 'BazarPro' }),
}));

const save = vi.fn();

describe('language switch', () => {
  beforeEach(() => {
    save.mockReset();
    vi.mocked(useMutation).mockReturnValue(save as unknown as ReturnType<typeof useMutation>);
  });

  it('switches the texts and saves the choice at the account', async () => {
    vi.mocked(useConvexAuth).mockReturnValue({ isAuthenticated: true, isLoading: false });
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
    vi.mocked(useConvexAuth).mockReturnValue({ isAuthenticated: false, isLoading: false });
    render(<LanguageSelect />);
    fireEvent.change(screen.getByLabelText('Sprache auswählen'), { target: { value: 'en' } });
    expect(i18n.language).toBe('en');
    expect(save).not.toHaveBeenCalled();
  });
});
